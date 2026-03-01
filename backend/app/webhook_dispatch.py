"""Webhook dispatcher — subscribes to the event broker and fires HTTP POSTs to registered webhooks."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

import httpx

from app.db import SessionLocal
from app.events import EventMessage, broker

logger = logging.getLogger(__name__)

_WEBHOOK_TIMEOUT = 10.0

# Events that webhooks can subscribe to
WEBHOOK_EVENTS = {
    "task.created",
    "task.updated",
    "task.status_changed",
    "task.deleted",
    "project.created",
    "project.updated",
}


def _sign_payload(payload_bytes: bytes, secret: str) -> str:
    """Compute HMAC-SHA256 signature for webhook payload."""
    return hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()


def _build_webhook_payload(event_type: str, message: EventMessage) -> dict:
    """Build the webhook payload from an event message."""
    payload: dict = {
        "event": event_type,
        "timestamp": message.ts.isoformat(),
        "data": {k: v for k, v in message.payload.items() if not k.startswith("_")},
    }

    # For status_changed, include previous status
    if event_type == "task.status_changed":
        old_status = message.payload.get("_old_status")
        if old_status:
            payload["previous"] = {"status": old_status}

    return payload


async def _fire_webhook(url: str, payload: dict, secret: str | None) -> bool:
    """Send a webhook HTTP POST. Returns True on success."""
    payload_bytes = json.dumps(payload, default=str).encode()
    headers = {"Content-Type": "application/json"}

    if secret:
        headers["X-ClawControl-Signature"] = _sign_payload(payload_bytes, secret)

    try:
        async with httpx.AsyncClient(timeout=_WEBHOOK_TIMEOUT) as client:
            resp = await client.post(url, content=payload_bytes, headers=headers)
            if resp.status_code < 300:
                return True
            logger.warning("Webhook %s returned %s", url, resp.status_code)
            return False
    except Exception as e:
        logger.warning("Webhook %s failed: %s", url, e)
        return False


def _get_active_webhooks() -> list[dict]:
    """Fetch all active webhooks from the database."""
    db = SessionLocal()
    try:
        from sqlalchemy import text
        rows = db.execute(
            text("SELECT id, url, events, secret FROM webhooks WHERE active = 1")
        ).mappings().all()
        return [dict(r) for r in rows]
    except Exception:
        logger.exception("Failed to fetch webhooks")
        return []
    finally:
        db.close()


def _matches_webhook(webhook: dict, event_type: str) -> bool:
    """Check if a webhook subscribes to a given event type."""
    subscribed = {e.strip() for e in webhook["events"].split(",") if e.strip()}
    if "*" in subscribed:
        return True
    return event_type in subscribed


async def _dispatch_event(message: EventMessage) -> None:
    """Dispatch an event to all matching webhooks."""
    # Determine which webhook event types this broker event maps to
    event_types: list[str] = []

    if message.event_type in WEBHOOK_EVENTS:
        event_types.append(message.event_type)

    # task.updated also triggers task.status_changed if _old_status is present
    if message.event_type == "task.status_changed":
        # Already in the list from the check above
        pass

    if not event_types:
        return

    webhooks = _get_active_webhooks()
    if not webhooks:
        return

    for event_type in event_types:
        payload = _build_webhook_payload(event_type, message)

        # Fire to all matching webhooks concurrently
        tasks = []
        for wh in webhooks:
            if _matches_webhook(wh, event_type):
                tasks.append(_fire_webhook(wh["url"], payload, wh.get("secret")))

        if tasks:
            await asyncio.gather(*tasks)


async def webhook_dispatcher_loop() -> None:
    """Background loop that subscribes to the event broker and dispatches webhooks.

    Runs for the lifetime of the application.
    """
    logger.info("Webhook dispatcher started")
    async with broker.subscribe() as queue:
        while True:
            try:
                message = await queue.get()
                await _dispatch_event(message)
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in webhook dispatcher")
