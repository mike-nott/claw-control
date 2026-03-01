from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

import httpx
from app.db import get_db, json_param
from app.events import broker
from app.federation_sync import _map_value, _reverse_map, push_task_update
from app.models import TASK_STATUSES
from app.schemas import TaskCreateIn, TaskPatchIn, TaskShareRequest
from app.utils.sanitise import sanitise_title, sanitise_text

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


def _fetch_task_or_404(db: Session, task_id: str) -> dict[str, Any]:
    row = db.execute(text("SELECT * FROM tasks WHERE id = :task_id"), {"task_id": task_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Task not found")
    return dict(row)


def _insert_activity(
    db: Session,
    *,
    task_id: str,
    agent_id: str | None,
    activity_type: str,
    summary: str,
    detail_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    row = db.execute(
        text(
            """
            INSERT INTO activities (id, task_id, agent_id, activity_type, summary, detail_json)
            VALUES (:id, :task_id, :agent_id, :activity_type, :summary, :detail_json)
            RETURNING *
            """
        ),
        {
            "id": str(uuid4()),
            "task_id": task_id,
            "agent_id": agent_id,
            "activity_type": activity_type,
            "summary": summary,
            "detail_json": json_param(detail_json or {}),
        },
    ).mappings().one()
    return dict(row)


def _validate_status(status: str) -> None:
    if status not in TASK_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid task status")


@router.get("", summary="List tasks")
async def list_tasks(
    status: str | None = None,
    assignee: str | None = None,
    project_id: str | None = None,
    board_id: str | None = None,
    q: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    cursor: datetime | None = None,
    db: Session = Depends(get_db),
) -> list[dict]:
    """List tasks with optional filters. Supports cursor-based pagination via `cursor` (created_at timestamp)."""
    clauses = []
    params: dict[str, Any] = {"limit": limit}

    if status:
        clauses.append("status = :status")
        params["status"] = status
    if assignee:
        clauses.append("assignee_agent_id = :assignee")
        params["assignee"] = assignee
    if project_id:
        clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    if board_id:
        clauses.append("board_id = :board_id")
        params["board_id"] = board_id
    if q:
        clauses.append("(title LIKE :q OR summary LIKE :q)")
        params["q"] = f"%{q}%"
    if cursor:
        clauses.append("created_at < :cursor")
        params["cursor"] = cursor

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    rows = db.execute(
        text(
            f"""
            SELECT *
            FROM tasks
            {where_sql}
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("", summary="Create a task")
async def create_task(payload: TaskCreateIn, db: Session = Depends(get_db)) -> dict:
    """Create a new task. Auto-assigns to main agent if priority is high/urgent and no assignee is set."""
    _validate_status(payload.status)

    task_id = str(uuid4())

    # Auto-resolve project_id from board if not explicitly set
    project_id = payload.project_id
    if payload.board_id and not project_id:
        board_row = db.execute(
            text("SELECT project_id FROM boards WHERE id = :bid"),
            {"bid": payload.board_id},
        ).mappings().first()
        if board_row:
            project_id = board_row["project_id"]

    row = db.execute(
        text(
            """
            INSERT INTO tasks (
                id, title, summary, type, status, priority,
                assignee_agent_id, worker_kind, payload_json, source_event_ids_json,
                created_by, due_at, project_id, board_id, reviewer_agent_id
            ) VALUES (
                :id, :title, :summary, :type, :status, :priority,
                :assignee_agent_id, :worker_kind, :payload_json, :source_event_ids_json,
                :created_by, :due_at, :project_id, :board_id, :reviewer_agent_id
            )
            RETURNING *
            """
        ),
        {
            "id": task_id,
            "title": sanitise_title(payload.title),
            "summary": sanitise_text(payload.summary),
            "type": payload.type,
            "status": payload.status,
            "priority": payload.priority,
            "assignee_agent_id": payload.assignee_agent_id or ("main" if payload.priority in ("high", "urgent") else None),
            "worker_kind": payload.worker_kind,
            "payload_json": json_param(payload.payload_json),
            "source_event_ids_json": json_param(payload.source_event_ids_json),
            "created_by": payload.created_by,
            "due_at": payload.due_at,
            "project_id": project_id,
            "board_id": payload.board_id,
            "reviewer_agent_id": payload.reviewer_agent_id,
        },
    ).mappings().one()

    # Look up source activity title for richer timeline entry
    source_note = ""
    if payload.source_event_ids_json and isinstance(payload.source_event_ids_json, dict):
        activity_ids = payload.source_event_ids_json.get("activity_log", [])
        if activity_ids:
            source_row = db.execute(
                text("SELECT title FROM activity_log WHERE id = :id"),
                {"id": activity_ids[0]}
            ).mappings().first()
            if source_row:
                source_note = f" (from activity: {source_row['title']})"

    activity = _insert_activity(
        db,
        task_id=task_id,
        agent_id=payload.assignee_agent_id,
        activity_type="task.created",
        summary=f"Created by {payload.created_by or 'unknown'}{source_note}",
        detail_json={
            "status": payload.status,
            "priority": payload.priority,
            "assignee": payload.assignee_agent_id,
        },
    )

    db.commit()

    task = dict(row)
    await broker.publish("task.created", task)
    await broker.publish("activity.created", activity)

    return task


@router.get("/{task_id}", summary="Get task by ID")
async def get_task(task_id: str, db: Session = Depends(get_db)) -> dict:
    """Return full task details including payload and metadata."""
    return _fetch_task_or_404(db, task_id)


@router.patch("/{task_id}", summary="Update a task")
async def patch_task(task_id: str, payload: TaskPatchIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Partially update a task. Only fields included in the request body are changed. Creates a timeline activity entry for meaningful changes."""
    existing = _fetch_task_or_404(db, task_id)
    updates = payload.model_dump(exclude_unset=True)
    if "title" in updates and updates["title"] is not None:
        updates["title"] = sanitise_title(updates["title"])
    if "summary" in updates and updates["summary"] is not None:
        updates["summary"] = sanitise_text(updates["summary"])
    if "status" in updates and updates["status"] is not None:
        _validate_status(updates["status"])

    if not updates:
        return existing

    # Auto-resolve project_id from board if board_id is changing
    if "board_id" in updates and updates["board_id"]:
        board_row = db.execute(
            text("SELECT project_id FROM boards WHERE id = :bid"),
            {"bid": updates["board_id"]},
        ).mappings().first()
        if board_row:
            updates["project_id"] = board_row["project_id"]

    # Capture old values before update for rich timeline
    old_task = dict(existing)

    set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"task_id": task_id}

    for key, value in updates.items():
        if key in {"payload_json", "source_event_ids_json"}:
            set_clauses.append(f"{key} = :{key}")
            params[key] = json_param(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE tasks
            SET {', '.join(set_clauses)}
            WHERE id = :task_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()

    # Build rich summary and change details for timeline
    _INTERNAL_FIELDS = {"mm_card_id", "payload_json", "source_event_ids_json"}
    changes = []
    change_details = []
    for field in sorted(updates.keys()):
        if field in _INTERNAL_FIELDS:
            continue
        old_val = str(old_task.get(field) or "")
        new_val = str(updates[field] or "")
        if old_val == new_val:
            continue
        if field == "status":
            changes.append(f"Status \u2192 {new_val}")
        elif field == "priority":
            changes.append(f"Priority \u2192 {new_val}")
        elif field == "assignee_agent_id":
            changes.append(f"Assigned to {new_val}")
        elif field == "reviewer_agent_id":
            changes.append(f"Reviewer \u2192 {new_val}")
        elif field == "title":
            changes.append("Title changed")
        elif field == "summary":
            changes.append("Summary updated")
        elif field == "due_at":
            changes.append(f"Due date \u2192 {new_val or 'removed'}")
        else:
            changes.append(f"{field} updated")
        change_details.append({"field": field, "from": old_val, "to": new_val})

    # Only create activity if meaningful fields changed
    if changes:
        summary = ", ".join(changes)
        activity = _insert_activity(
            db,
            task_id=task_id,
            agent_id=row.get("assignee_agent_id"),
            activity_type="task.updated",
            summary=summary,
            detail_json={"changes": change_details},
        )
    else:
        activity = None

    db.commit()

    task = dict(row)
    await broker.publish("task.updated", task)

    # Publish specific status_changed event for webhook subscribers
    status_change = next((d for d in change_details if d["field"] == "status"), None)
    if status_change:
        await broker.publish("task.status_changed", {**task, "_old_status": status_change["from"]})

    if activity:
        await broker.publish("activity.created", activity)

    # Push update to federated instances (non-blocking)
    background_tasks.add_task(push_task_update, task_id, db)

    return task


@router.delete("/{task_id}", summary="Delete a task")
async def delete_task(task_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a task and all its associated activities."""
    existing = _fetch_task_or_404(db, task_id)
    db.execute(text("DELETE FROM activities WHERE task_id = :task_id"), {"task_id": task_id})
    db.execute(text("DELETE FROM tasks WHERE id = :task_id"), {"task_id": task_id})
    db.commit()
    await broker.publish("task.deleted", existing)
    return {"deleted": True, "id": task_id}


@router.delete("", summary="Bulk delete tasks")
async def bulk_delete_tasks(
    status: str | None = None,
    assignee: str | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Delete multiple tasks. At least one filter (status or assignee) is required."""
    if not status and not assignee:
        raise HTTPException(status_code=422, detail="Provide at least one filter (status or assignee)")

    clauses = []
    params: dict[str, Any] = {}
    if status:
        clauses.append("status = :status")
        params["status"] = status
    if assignee:
        clauses.append("assignee_agent_id = :assignee")
        params["assignee"] = assignee

    where_sql = " AND ".join(clauses)

    # Get IDs first for cleanup
    task_ids = [
        r["id"]
        for r in db.execute(text(f"SELECT id FROM tasks WHERE {where_sql}"), params).mappings().all()
    ]

    if task_ids:
        db.execute(text(f"DELETE FROM activities WHERE task_id IN (SELECT id FROM tasks WHERE {where_sql})"), params)
        db.execute(text(f"DELETE FROM tasks WHERE {where_sql}"), params)
        db.commit()

    return {"deleted": True, "count": len(task_ids)}


# ---- federation task sharing ----


_SHARE_TIMEOUT = 10.0


@router.post("/{task_id}/share", summary="Share a task with a connected instance")
async def share_task(
    task_id: str,
    payload: TaskShareRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Share a local task with a connected ClawControl instance.

    Sends the task to the remote, creates a federation link on success.
    """
    task = _fetch_task_or_404(db, task_id)

    # Validate connection
    conn = db.execute(
        text("SELECT * FROM federation_connections WHERE id = :id AND status = 'active'"),
        {"id": payload.connection_id},
    ).mappings().first()
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found or not active")
    conn = dict(conn)

    # Check not already shared with this connection
    existing_link = db.execute(
        text(
            "SELECT id FROM federation_task_links WHERE local_task_id = :tid AND connection_id = :cid"
        ),
        {"tid": task_id, "cid": payload.connection_id},
    ).first()
    if existing_link:
        raise HTTPException(status_code=409, detail="Task already shared with this connection")

    # Build federated task payload with agent/status mapping
    agent_map = conn.get("agent_map") or {}
    status_map = conn.get("status_map") or {}

    federated = {
        "remote_task_id": str(task["id"]),
        "title": task["title"],
        "description": task["summary"],
        "status": _reverse_map(status_map, task["status"]),
        "priority": task["priority"],
        "assignee": payload.assignee_mapping or _reverse_map(agent_map, task.get("assignee_agent_id")),
        "created_at": task["created_at"].isoformat(),
        "updated_at": task["updated_at"].isoformat(),
    }

    # Send to remote
    try:
        async with httpx.AsyncClient(timeout=_SHARE_TIMEOUT) as client:
            resp = await client.post(
                f"{conn['endpoint']}/api/federation/remote/tasks/inbound",
                json=federated,
                headers={"Authorization": f"Bearer {conn['token_theirs']}"},
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach remote instance: {e}")

    if resp.status_code == 409:
        raise HTTPException(status_code=409, detail="Remote instance reports task already linked")
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Remote rejected task: {resp.status_code} {resp.text}",
        )

    # Create local link
    link_id = str(uuid4())
    db.execute(
        text(
            """
            INSERT INTO federation_task_links (id, local_task_id, remote_task_id, connection_id, direction)
            VALUES (:id, :local_task_id, :remote_task_id, :connection_id, 'outbound')
            """
        ),
        {
            "id": link_id,
            "local_task_id": task_id,
            "remote_task_id": str(task["id"]),
            "connection_id": payload.connection_id,
        },
    )
    db.commit()

    return _get_federation_info(task_id, db)


@router.delete("/{task_id}/share/{connection_id}", summary="Unshare a task", status_code=204)
async def unshare_task(
    task_id: str,
    connection_id: str,
    db: Session = Depends(get_db),
) -> Response:
    """Remove federation sharing for a task with a specific connection. Notifies remote (best-effort)."""
    link = db.execute(
        text(
            """
            SELECT ftl.*, fc.endpoint, fc.token_theirs
            FROM federation_task_links ftl
            JOIN federation_connections fc ON fc.id = ftl.connection_id
            WHERE ftl.local_task_id = :tid AND ftl.connection_id = :cid
            """
        ),
        {"tid": task_id, "cid": connection_id},
    ).mappings().first()

    if not link:
        raise HTTPException(status_code=404, detail="Federation link not found")

    link = dict(link)

    # Best-effort notify remote
    try:
        async with httpx.AsyncClient(timeout=_SHARE_TIMEOUT) as client:
            await client.post(
                f"{link['endpoint']}/api/federation/remote/tasks/{link['remote_task_id']}/unshare",
                headers={"Authorization": f"Bearer {link['token_theirs']}"},
            )
    except Exception:
        log.warning("Could not notify remote of unshare for task %s", task_id)

    db.execute(
        text("DELETE FROM federation_task_links WHERE local_task_id = :tid AND connection_id = :cid"),
        {"tid": task_id, "cid": connection_id},
    )
    db.commit()

    return Response(status_code=204)


@router.get("/{task_id}/federation", summary="Get task federation info")
async def get_task_federation(task_id: str, db: Session = Depends(get_db)) -> dict:
    """Return federation metadata for a task — whether it's shared, with whom, and sync status."""
    _fetch_task_or_404(db, task_id)
    return _get_federation_info(task_id, db)


def _get_federation_info(task_id: str, db: Session) -> dict:
    """Build TaskFederationInfo dict for a task."""
    rows = db.execute(
        text(
            """
            SELECT ftl.connection_id, ftl.remote_task_id, ftl.direction, ftl.last_synced_at,
                   fc.name AS connection_name
            FROM federation_task_links ftl
            JOIN federation_connections fc ON fc.id = ftl.connection_id
            WHERE ftl.local_task_id = :tid
            """
        ),
        {"tid": task_id},
    ).mappings().all()

    if not rows:
        return {"is_shared": False, "direction": None, "connections": []}

    connections = []
    direction = None
    for r in rows:
        r = dict(r)
        direction = r["direction"]
        connections.append({
            "connection_id": str(r["connection_id"]),
            "connection_name": r["connection_name"],
            "remote_task_id": r["remote_task_id"],
            "last_synced_at": r["last_synced_at"],
        })

    return {"is_shared": True, "direction": direction, "connections": connections}
