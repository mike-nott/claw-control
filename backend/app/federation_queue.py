"""Federation sync queue processor.

Retries failed outbound sync events on a recurring schedule.
Runs as a background task within the FastAPI process.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_RETRY_TIMEOUT = 5.0
_MAX_ATTEMPTS = 10
_MAX_PER_CYCLE = 100
_EXPIRE_AFTER_DAYS = 7
_CLEANUP_AFTER_DAYS = 30
_BROKEN_THRESHOLD = 3


async def process_sync_queue(db: Session) -> dict:
    """Process pending events in the federation sync queue.

    Retries each event, marks delivered on success, increments attempts on failure.
    Events exceeding max attempts are marked failed.
    """
    events = db.execute(
        text(
            """
            SELECT sq.*, fc.endpoint, fc.token_theirs, fc.status AS conn_status
            FROM federation_sync_queue sq
            JOIN federation_connections fc ON fc.id = sq.connection_id
            WHERE sq.status = 'pending'
            ORDER BY sq.created_at ASC
            LIMIT :limit
            """
        ),
        {"limit": _MAX_PER_CYCLE},
    ).mappings().all()

    summary = {"processed": 0, "delivered": 0, "failed": 0, "skipped": 0}
    conn_failures: dict[str, int] = {}

    for row in events:
        event = dict(row)
        summary["processed"] += 1

        if event["conn_status"] != "active":
            summary["skipped"] += 1
            continue

        payload = dict(event["payload"]) if event["payload"] else {}
        url_remote_task_id = payload.pop("_url_remote_task_id", None)

        endpoint = event["endpoint"]
        event_type = event["event_type"]

        # Determine target URL and HTTP method
        if event_type == "task_create":
            url = f"{endpoint}/api/federation/remote/tasks/inbound"
            method = "POST"
        elif event_type == "task_update":
            if not url_remote_task_id:
                url_remote_task_id = payload.get("remote_task_id")
            url = f"{endpoint}/api/federation/remote/tasks/{url_remote_task_id}/update"
            method = "PATCH"
        elif event_type == "comment_add":
            url = f"{endpoint}/api/federation/remote/tasks/{url_remote_task_id}/comment"
            method = "POST"
        else:
            logger.warning("Unknown event type %s for queue event %s", event_type, event["id"])
            summary["skipped"] += 1
            continue

        try:
            async with httpx.AsyncClient(timeout=_RETRY_TIMEOUT) as client:
                if method == "PATCH":
                    resp = await client.patch(
                        url,
                        json=payload,
                        headers={"Authorization": f"Bearer {event['token_theirs']}"},
                    )
                else:
                    resp = await client.post(
                        url,
                        json=payload,
                        headers={"Authorization": f"Bearer {event['token_theirs']}"},
                    )

            if resp.status_code in (200, 201):
                db.execute(
                    text(
                        """
                        UPDATE federation_sync_queue
                        SET status = 'delivered', last_attempt_at = CURRENT_TIMESTAMP
                        WHERE id = :id
                        """
                    ),
                    {"id": event["id"]},
                )
                db.execute(
                    text("UPDATE federation_connections SET last_sync_at = CURRENT_TIMESTAMP WHERE id = :cid"),
                    {"cid": event["connection_id"]},
                )
                summary["delivered"] += 1
                logger.info("Queue retry delivered: event %s type %s", event["id"], event_type)
            else:
                _mark_attempt_failed(db, event)
                conn_failures[event["connection_id"]] = conn_failures.get(event["connection_id"], 0) + 1
                summary["failed"] += 1
                logger.warning(
                    "Queue retry failed: event %s type %s status %s",
                    event["id"], event_type, resp.status_code,
                )
        except Exception as e:
            _mark_attempt_failed(db, event)
            conn_failures[event["connection_id"]] = conn_failures.get(event["connection_id"], 0) + 1
            summary["failed"] += 1
            logger.warning("Queue retry error: event %s type %s: %s", event["id"], event_type, e)

    # Check for connections that should be marked broken
    for connection_id in conn_failures:
        _maybe_mark_broken(db, connection_id)

    db.commit()
    return summary


def _mark_attempt_failed(db: Session, event: dict) -> None:
    """Increment attempt count; mark failed if max attempts exceeded."""
    new_attempts = (event.get("attempts") or 0) + 1
    new_status = "failed" if new_attempts >= _MAX_ATTEMPTS else "pending"
    db.execute(
        text(
            """
            UPDATE federation_sync_queue
            SET attempts = :attempts, last_attempt_at = CURRENT_TIMESTAMP, status = :status
            WHERE id = :id
            """
        ),
        {"id": event["id"], "attempts": new_attempts, "status": new_status},
    )


def _maybe_mark_broken(db: Session, connection_id: str) -> None:
    """Mark a connection as broken if all its pending events have failed repeatedly."""
    result = db.execute(
        text(
            """
            SELECT COUNT(*) AS total,
                   SUM(CASE WHEN attempts >= :threshold THEN 1 ELSE 0 END) AS failing
            FROM federation_sync_queue
            WHERE connection_id = :cid AND status = 'pending'
            """
        ),
        {"cid": connection_id, "threshold": _BROKEN_THRESHOLD},
    ).mappings().first()

    if result and result["total"] > 0 and result["total"] == result["failing"]:
        db.execute(
            text("UPDATE federation_connections SET status = 'broken' WHERE id = :id AND status = 'active'"),
            {"id": connection_id},
        )
        logger.warning("Connection %s marked as broken due to repeated failures", connection_id)


def expire_old_events(db: Session) -> int:
    """Mark pending events older than 7 days as expired."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=_EXPIRE_AFTER_DAYS)
    result = db.execute(
        text(
            """
            UPDATE federation_sync_queue
            SET status = 'expired'
            WHERE status = 'pending' AND created_at < :cutoff
            """
        ),
        {"cutoff": cutoff},
    )
    count = result.rowcount
    if count:
        db.commit()
        logger.info("Expired %d old federation sync events", count)
    return count


def cleanup_delivered_events(db: Session, older_than_days: int = _CLEANUP_AFTER_DAYS) -> int:
    """Delete delivered events older than N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    result = db.execute(
        text(
            """
            DELETE FROM federation_sync_queue
            WHERE status = 'delivered' AND created_at < :cutoff
            """
        ),
        {"cutoff": cutoff},
    )
    count = result.rowcount
    if count:
        db.commit()
        logger.info("Cleaned up %d old delivered federation sync events", count)
    return count
