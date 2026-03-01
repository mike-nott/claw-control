from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db, json_param
from app.events import broker
from app.utils.sanitise import sanitise_title, sanitise_text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/escalations", tags=["escalations"])

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:18789")
HOOKS_TOKEN = os.getenv("HOOKS_TOKEN", "")
WAKE_DEDUP_MINUTES = 15


@router.get("", summary="List escalations")
async def list_escalations(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    """List escalations with optional status filter and pagination."""
    clauses: list[str] = []
    params: dict[str, Any] = {"limit": limit, "offset": offset}

    if status:
        clauses.append("status = :status")
        params["status"] = status

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db.execute(
        text(f"""
            SELECT id, agent_id, title, summary, priority, source, status,
                   created_at, acknowledged_at, resolved_at, resolved_by
            FROM escalations
            {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{escalation_id}", summary="Get escalation by ID")
async def get_escalation(
    escalation_id: str,
    db: Session = Depends(get_db),
) -> dict:
    """Return full escalation details."""
    row = db.execute(
        text("SELECT * FROM escalations WHERE id = :id"),
        {"id": escalation_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Escalation not found")
    return dict(row)


@router.post("", summary="Create an escalation")
async def create_escalation(
    payload: dict,
    db: Session = Depends(get_db),
) -> dict:
    """Create an escalation from a hook agent. Logs to activity feed and wakes the main agent with 15-min dedup."""
    priority = payload.get("priority", "urgent")
    if priority not in ("high", "urgent"):
        raise HTTPException(status_code=422, detail="priority must be 'high' or 'urgent'")

    esc_id = str(uuid4())
    agent_id = payload.get("agent_id")
    title = sanitise_title(payload.get("title", "Untitled Escalation"))
    summary = sanitise_text(payload.get("summary") or "")
    source = payload.get("source")
    esc_payload = payload.get("payload", {})

    row = db.execute(
        text("""
            INSERT INTO escalations (id, agent_id, title, summary, priority, source, payload)
            VALUES (:id, :agent_id, :title, :summary, :priority, :source, :payload)
            RETURNING id, agent_id, title, summary, priority, source, status,
                      created_at, acknowledged_at, resolved_at, resolved_by
        """),
        {
            "id": esc_id,
            "agent_id": agent_id,
            "title": title,
            "summary": summary,
            "priority": priority,
            "source": source,
            "payload": json_param(esc_payload),
        },
    ).mappings().one()
    db.commit()
    result = dict(row)

    # Insert activity_log entry so it appears on the Activity page
    activity_id = str(uuid4())
    activity_row = db.execute(
        text("""
            INSERT INTO activity_log (id, type, priority, source, agent_id, title, summary, payload, created_at)
            VALUES (:id, 'escalation', :priority, :source, :agent_id, :title, :summary, :payload, CURRENT_TIMESTAMP)
            RETURNING id, type, priority, source, agent_id, title, summary, created_at
        """),
        {
            "id": activity_id,
            "priority": priority,
            "source": source or "escalation",
            "agent_id": agent_id,
            "title": title,
            "summary": summary,
            "payload": json_param({"escalation_id": esc_id, **esc_payload}),
        },
    ).mappings().one()
    db.commit()

    # SSE: push to activity feed
    await broker.publish("activity_log.created", dict(activity_row))

    # Wake main agent (with dedup)
    await _maybe_wake_gateway(db, result)

    return result


@router.patch("/{escalation_id}", summary="Update escalation status")
async def patch_escalation(
    escalation_id: str,
    body: dict,
    db: Session = Depends(get_db),
) -> dict:
    """Update an escalation's status (pending, acknowledged, resolved). Sets timestamps automatically."""
    existing = db.execute(
        text("SELECT * FROM escalations WHERE id = :id"),
        {"id": escalation_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Escalation not found")

    new_status = body.get("status")
    resolved_by = body.get("resolved_by")

    if not new_status:
        raise HTTPException(status_code=422, detail="status is required")
    if new_status not in ("pending", "acknowledged", "resolved"):
        raise HTTPException(status_code=422, detail="Invalid status")

    sets = ["status = :status"]
    params: dict[str, Any] = {"id": escalation_id, "status": new_status}

    if new_status == "acknowledged":
        sets.append("acknowledged_at = CURRENT_TIMESTAMP")
    elif new_status == "resolved":
        sets.append("resolved_at = CURRENT_TIMESTAMP")
        if resolved_by:
            sets.append("resolved_by = :resolved_by")
            params["resolved_by"] = resolved_by

    row = db.execute(
        text(f"""
            UPDATE escalations SET {', '.join(sets)}
            WHERE id = :id
            RETURNING id, agent_id, title, summary, priority, source, status,
                      created_at, acknowledged_at, resolved_at, resolved_by
        """),
        params,
    ).mappings().one()
    db.commit()

    return dict(row)


async def _maybe_wake_gateway(db: Session, escalation: dict) -> None:
    """Wake main agent via /hooks/agent (isolated run), with 15-min dedup per agent+title."""
    if not HOOKS_TOKEN:
        logger.warning("HOOKS_TOKEN not set — cannot wake main agent")
        return

    # Dedup: skip if same agent_id + title already created within last 15 min
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=WAKE_DEDUP_MINUTES)
    dupe = db.execute(
        text("""
            SELECT id FROM escalations
            WHERE agent_id = :agent_id AND title = :title
              AND created_at > :cutoff AND id != :id
            LIMIT 1
        """),
        {
            "agent_id": escalation.get("agent_id"),
            "title": escalation["title"],
            "cutoff": cutoff,
            "id": escalation["id"],
        },
    ).first()

    if dupe:
        logger.info(f"Skipping wake — duplicate escalation within {WAKE_DEDUP_MINUTES}min")
        return

    source = escalation.get('agent_id', 'unknown')
    text_msg = f"\U0001f6a8 ESCALATION from {source}: {escalation['title']}"
    if escalation.get("summary"):
        text_msg += f"\n{escalation['summary']}"
    text_msg += "\nCheck ClawControl for details."

    try:
        import httpx

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{GATEWAY_URL}/hooks/agent",
                json={
                    "message": text_msg,
                    "name": f"Escalation ({source})",
                    "agentId": "main",
                    "wakeMode": "now",
                    "deliver": False,
                },
                headers={"Authorization": f"Bearer {HOOKS_TOKEN}"},
            )
            if resp.status_code == 200:
                logger.info(f"Main agent woken for escalation {escalation['id']}")
            else:
                logger.error(f"Wake failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"Wake failed: {e}")
