from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from uuid import uuid4

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db, json_param
from app.events import broker
from app.utils.sanitise import sanitise_title, sanitise_text


def _parse_json_field(value: Any) -> Any:
    """Parse a JSON string to a Python object. SQLite returns JSON columns as text."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return {}
    return value if value is not None else {}

# NOTE: disk path still uses mission-control/ — will change when directory is renamed
MEDIA_DIR = Path(__file__).resolve().parent.parent.parent.parent / "media"  # claw-control/media/


router = APIRouter(prefix="/api/activity", tags=["activity_log"])


@router.get("", summary="List activity feed")
async def list_activity(
    type: str | None = None,
    priority: str | None = None,
    source: str | None = None,
    agent_id: str | None = None,
    since: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    cursor: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    """List system-wide activity entries with optional filters. Supports cursor-based pagination."""
    clauses = []
    params: dict[str, Any] = {"limit": limit}

    if type:
        clauses.append("type = :type")
        params["type"] = type
    if priority:
        clauses.append("priority = :priority")
        params["priority"] = priority
    if source:
        clauses.append("source = :source")
        params["source"] = source
    if agent_id:
        clauses.append("agent_id = :agent_id")
        params["agent_id"] = agent_id
    if since:
        clauses.append("created_at >= :since")
        params["since"] = since
    if cursor:
        clauses.append("created_at < :cursor")
        params["cursor"] = cursor

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db.execute(
        text(
            f"""
            SELECT id, type, priority, source, agent_id, title, summary, created_at
            FROM activity_log
            {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


@router.get("/media/{path:path}", summary="Serve media file")
async def serve_media(path: str):
    """Serve media files (thumbnails) from the media directory."""
    file_path = MEDIA_DIR / path
    if not file_path.resolve().is_relative_to(MEDIA_DIR.resolve()):
        raise HTTPException(status_code=403, detail="Forbidden")
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, media_type="image/jpeg")


@router.get("/filters", summary="Get filter options")
async def get_filters(db: Session = Depends(get_db)) -> dict:
    """Return distinct values for filter dropdowns."""
    types = db.execute(text("SELECT DISTINCT type FROM activity_log ORDER BY type")).scalars().all()
    sources = db.execute(text("SELECT DISTINCT source FROM activity_log ORDER BY source")).scalars().all()
    return {"types": types, "sources": sources}


@router.get("/{activity_id}", summary="Get activity by ID")
async def get_activity(activity_id: str, db: Session = Depends(get_db)) -> dict:
    """Return full activity entry including payload."""
    row = db.execute(
        text("SELECT * FROM activity_log WHERE id = :id"),
        {"id": activity_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Activity not found")
    result = dict(row)
    if "payload" in result:
        result["payload"] = _parse_json_field(result["payload"])
    return result


@router.post("", summary="Log an activity")
async def create_activity(payload: dict, db: Session = Depends(get_db)) -> dict:
    """Create a new activity log entry. Used by agents and services to report actions and events."""
    activity_id = str(uuid4())
    agent_id = payload.get("agent_id") or payload.get("domain")
    row = db.execute(
        text(
            """
            INSERT INTO activity_log (id, type, priority, source, agent_id, title, summary, payload, created_at)
            VALUES (:id, :type, :priority, :source, :agent_id, :title, :summary, :payload, CURRENT_TIMESTAMP)
            RETURNING id, type, priority, source, agent_id, title, summary, created_at
            """
        ),
        {
            "id": activity_id,
            "type": payload.get("type", "unknown"),
            "priority": payload.get("priority", "low"),
            "source": payload.get("source", "unknown"),
            "agent_id": agent_id,
            "title": sanitise_title(payload.get("title", "Untitled")),
            "summary": sanitise_text(payload.get("summary") or ""),
            "payload": json_param(payload.get("payload", {})),
        },
    ).mappings().one()
    db.commit()

    result = dict(row)
    await broker.publish("activity_log.created", result)
    return result


@router.post("/{activity_id}/promote", summary="Promote to task")
async def promote_to_task(activity_id: str, db: Session = Depends(get_db)) -> dict:
    """Promote an activity log entry to a real task."""
    row = db.execute(
        text("SELECT * FROM activity_log WHERE id = :id"),
        {"id": activity_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Activity not found")

    activity = dict(row)
    if "payload" in activity:
        activity["payload"] = _parse_json_field(activity["payload"])
    task_id = str(uuid4())
    task_row = db.execute(
        text(
            """
            INSERT INTO tasks (
                id, title, summary, type, status, priority,
                assignee_agent_id, worker_kind, payload_json, source_event_ids_json,
                created_by, due_at
            ) VALUES (
                :id, :title, :summary, :type, 'inbox', :priority,
                :agent_id, 'openclaw_agent', :payload, :source_events,
                :source, NULL
            )
            RETURNING *
            """
        ),
        {
            "id": task_id,
            "title": activity["title"],
            "summary": activity.get("summary", ""),
            "type": activity["type"],
            "priority": activity["priority"],
            "agent_id": activity.get("agent_id"),
            "payload": json_param(activity.get("payload", {})),
            "source_events": json_param({"activity_log": [str(activity["id"])]}),
            "source": activity["source"],
        },
    ).mappings().one()
    db.commit()

    task = dict(task_row)
    await broker.publish("task.created", task)
    return task
