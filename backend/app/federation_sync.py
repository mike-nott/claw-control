"""Outbound federation sync — push task updates and comments to connected instances."""

from __future__ import annotations

import logging
from uuid import uuid4

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import json_param

logger = logging.getLogger(__name__)

_SYNC_TIMEOUT = 10.0


def _map_value(mapping: dict, value: str | None) -> str | None:
    """Apply a mapping dict (agent_map or status_map). Returns original if no mapping found."""
    if not value or not mapping:
        return value
    return mapping.get(value, value)


def _reverse_map(mapping: dict, value: str | None) -> str | None:
    """Reverse-apply a mapping dict (our value → their key). Returns original if no match."""
    if not value or not mapping:
        return value
    for k, v in mapping.items():
        if v == value:
            return k
    return value


async def push_task_update(task_id: str, db: Session) -> None:
    """After a local task is updated, push changes to all connected instances that share it.

    Best-effort — failures are queued in federation_sync_queue for retry.
    """
    links = db.execute(
        text(
            """
            SELECT ftl.*, fc.endpoint, fc.token_theirs, fc.agent_map, fc.status_map, fc.status AS conn_status
            FROM federation_task_links ftl
            JOIN federation_connections fc ON fc.id = ftl.connection_id
            WHERE ftl.local_task_id = :task_id AND fc.status = 'active'
            """
        ),
        {"task_id": task_id},
    ).mappings().all()

    if not links:
        return

    task = db.execute(
        text("SELECT * FROM tasks WHERE id = :id"),
        {"id": task_id},
    ).mappings().first()
    if not task:
        return

    task = dict(task)

    for link in links:
        link = dict(link)
        agent_map = link.get("agent_map") or {}
        status_map = link.get("status_map") or {}

        if link["direction"] == "outbound":
            # We are the originator — send full task data
            payload = {
                "remote_task_id": str(task["id"]),
                "title": task["title"],
                "description": task["summary"],
                "status": _reverse_map(status_map, task["status"]),
                "priority": task["priority"],
                "assignee": _reverse_map(agent_map, task.get("assignee_agent_id")),
                "created_at": task["created_at"].isoformat(),
                "updated_at": task["updated_at"].isoformat(),
            }
        else:
            # We are the receiver — only send status/assignee changes
            payload = {
                "status": _reverse_map(status_map, task["status"]),
                "assignee": _reverse_map(agent_map, task.get("assignee_agent_id")),
            }

        remote_task_id = link["remote_task_id"]
        endpoint = f"{link['endpoint']}/api/federation/remote/tasks/{remote_task_id}/update"

        try:
            async with httpx.AsyncClient(timeout=_SYNC_TIMEOUT) as client:
                resp = await client.patch(
                    endpoint,
                    json=payload,
                    headers={"Authorization": f"Bearer {link['token_theirs']}"},
                )
                if resp.status_code == 200:
                    db.execute(
                        text("UPDATE federation_task_links SET last_synced_at = CURRENT_TIMESTAMP WHERE id = :id"),
                        {"id": link["id"]},
                    )
                    db.commit()
                    logger.info("Synced task %s to connection %s", task_id, link["connection_id"])
                else:
                    logger.warning("Sync failed for task %s: %s %s", task_id, resp.status_code, resp.text)
                    _queue_for_retry(db, link["connection_id"], "task_update", {**payload, "_url_remote_task_id": remote_task_id})
        except Exception as e:
            logger.warning("Sync failed for task %s: %s", task_id, e)
            _queue_for_retry(db, link["connection_id"], "task_update", {**payload, "_url_remote_task_id": remote_task_id})


async def push_comment(task_id: str, comment_id: str, db: Session) -> None:
    """After a comment is added to a shared task, push it to connected instances."""
    links = db.execute(
        text(
            """
            SELECT ftl.*, fc.endpoint, fc.token_theirs, fc.agent_map, fc.status AS conn_status
            FROM federation_task_links ftl
            JOIN federation_connections fc ON fc.id = ftl.connection_id
            WHERE ftl.local_task_id = :task_id AND fc.status = 'active'
            """
        ),
        {"task_id": task_id},
    ).mappings().all()

    if not links:
        return

    comment = db.execute(
        text("SELECT * FROM comments WHERE id = :id"),
        {"id": comment_id},
    ).mappings().first()
    if not comment:
        return

    comment = dict(comment)

    for link in links:
        link = dict(link)
        remote_task_id = link["remote_task_id"]

        payload = {
            "remote_comment_id": str(comment["id"]),
            "author": comment["author_id"],
            "content": comment["body"],
            "created_at": comment["created_at"].isoformat(),
        }

        endpoint = f"{link['endpoint']}/api/federation/remote/tasks/{remote_task_id}/comment"

        try:
            async with httpx.AsyncClient(timeout=_SYNC_TIMEOUT) as client:
                resp = await client.post(
                    endpoint,
                    json=payload,
                    headers={"Authorization": f"Bearer {link['token_theirs']}"},
                )
                if resp.status_code in (200, 201):
                    logger.info("Synced comment %s to connection %s", comment_id, link["connection_id"])
                else:
                    logger.warning("Comment sync failed: %s %s", resp.status_code, resp.text)
                    _queue_for_retry(db, link["connection_id"], "comment_add", {**payload, "_url_remote_task_id": remote_task_id})
        except Exception as e:
            logger.warning("Comment sync failed: %s", e)
            _queue_for_retry(db, link["connection_id"], "comment_add", {**payload, "_url_remote_task_id": remote_task_id})


def _queue_for_retry(db: Session, connection_id: str, event_type: str, payload: dict) -> None:
    """Add a failed sync event to the retry queue."""
    db.execute(
        text(
            """
            INSERT INTO federation_sync_queue (id, connection_id, event_type, payload)
            VALUES (:id, :connection_id, :event_type, :payload)
            """
        ),
        {
            "id": str(uuid4()),
            "connection_id": connection_id,
            "event_type": event_type,
            "payload": json_param(payload),
        },
    )
    db.commit()
