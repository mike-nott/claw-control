from __future__ import annotations

import logging
import secrets
from typing import Any
from uuid import uuid4

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db, json_param
from app.federation_sync import _map_value
from app.instance import get_instance_id, get_instance_name
from app.utils.sanitise import sanitise_title, sanitise_text
from app.federation_queue import cleanup_delivered_events, expire_old_events, process_sync_queue
from app.schemas import (
    ConnectionAcceptResponse,
    ConnectionInvite,
    ConnectionOut,
    ConnectionStatus,
    ConnectionUpdate,
    FederatedComment,
    FederatedTask,
    InviteRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/federation", tags=["federation"])

_REMOTE_TIMEOUT = 5.0


# ---- auth dependency ----


def _row_to_connection_out(row: dict) -> dict:
    """Convert a DB row to a ConnectionOut-safe dict (no tokens)."""
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "instance_id": str(row["instance_id"]),
        "endpoint": row["endpoint"],
        "status": row["status"],
        "agent_map": row["agent_map"] or {},
        "status_map": row["status_map"] or {},
        "created_at": row["created_at"],
        "last_sync_at": row.get("last_sync_at"),
    }


async def verify_federation_token(
    request: Request, db: Session = Depends(get_db)
) -> dict:
    """Validate Bearer token from a remote federation instance.

    Returns the matching connection row or raises 401/403.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth[7:]
    row = db.execute(
        text(
            """
            SELECT * FROM federation_connections
            WHERE token_ours = :token AND status != 'broken'
            """
        ),
        {"token": token},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=403, detail="Invalid federation token")
    return dict(row)


# ---- local management endpoints ----


@router.get("/connections", summary="List all federation connections")
async def list_connections(db: Session = Depends(get_db)) -> list[dict]:
    """List all federation connections. Tokens are never exposed."""
    rows = db.execute(
        text(
            """
            SELECT id, name, instance_id, endpoint, status, agent_map, status_map,
                   created_at, last_sync_at
            FROM federation_connections
            ORDER BY created_at DESC
            """
        )
    ).mappings().all()
    return [_row_to_connection_out(dict(r)) for r in rows]


@router.get("/connections/{connection_id}", summary="Get federation connection")
async def get_connection(connection_id: str, db: Session = Depends(get_db)) -> dict:
    """Get a single federation connection by ID. Tokens are never exposed."""
    row = db.execute(
        text(
            """
            SELECT id, name, instance_id, endpoint, status, agent_map, status_map,
                   created_at, last_sync_at
            FROM federation_connections
            WHERE id = :id
            """
        ),
        {"id": connection_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")
    return _row_to_connection_out(dict(row))


@router.patch("/connections/{connection_id}", summary="Update federation connection")
async def patch_connection(
    connection_id: str,
    payload: ConnectionUpdate,
    db: Session = Depends(get_db),
) -> dict:
    """Update connection name, agent_map, or status_map."""
    existing = db.execute(
        text("SELECT * FROM federation_connections WHERE id = :id"),
        {"id": connection_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Connection not found")

    updates = payload.model_dump(exclude_unset=True)
    if "name" in updates and updates["name"] is not None:
        updates["name"] = sanitise_title(updates["name"])
    if not updates:
        return _row_to_connection_out(dict(existing))

    set_clauses: list[str] = []
    params: dict[str, Any] = {"id": connection_id}

    for key, value in updates.items():
        if key in ("agent_map", "status_map"):
            set_clauses.append(f"{key} = :{key}")
            params[key] = json_param(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE federation_connections
            SET {', '.join(set_clauses)}
            WHERE id = :id
            RETURNING id, name, instance_id, endpoint, status, agent_map, status_map,
                      created_at, last_sync_at
            """
        ),
        params,
    ).mappings().one()
    db.commit()
    return _row_to_connection_out(dict(row))


@router.delete("/connections/{connection_id}", summary="Delete federation connection", status_code=204)
async def delete_connection(connection_id: str, db: Session = Depends(get_db)) -> Response:
    """Disconnect from a remote instance. Notifies the remote (best-effort) and removes local connection data.

    Task links are preserved as orphaned records so tasks aren't lost.
    """
    row = db.execute(
        text("SELECT * FROM federation_connections WHERE id = :id"),
        {"id": connection_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Connection not found")

    conn = dict(row)

    # Best-effort notify remote
    try:
        async with httpx.AsyncClient(timeout=_REMOTE_TIMEOUT) as client:
            await client.post(
                f"{conn['endpoint']}/api/federation/remote/disconnect",
                headers={"Authorization": f"Bearer {conn['token_theirs']}"},
            )
    except Exception:
        logger.warning("Could not notify remote %s of disconnect", conn["endpoint"])

    # Delete sync queue entries for this connection
    db.execute(
        text("DELETE FROM federation_sync_queue WHERE connection_id = :id"),
        {"id": connection_id},
    )
    # Note: federation_task_links has ON DELETE CASCADE on connection_id,
    # so deleting the connection will also remove task links.
    db.execute(
        text("DELETE FROM federation_connections WHERE id = :id"),
        {"id": connection_id},
    )
    db.commit()

    return Response(status_code=204)


@router.get("/status", summary="Health check all federation connections")
async def federation_status(db: Session = Depends(get_db)) -> list[dict]:
    """Ping all active connections and report reachability. Timeout: 5 seconds per connection."""
    rows = db.execute(
        text(
            """
            SELECT id, name, instance_id, endpoint, status, token_theirs, last_sync_at
            FROM federation_connections
            WHERE status = 'active'
            ORDER BY name
            """
        )
    ).mappings().all()

    results: list[dict] = []
    for row in rows:
        conn = dict(row)
        reachable = False
        remote_name: str | None = None

        try:
            async with httpx.AsyncClient(timeout=_REMOTE_TIMEOUT) as client:
                resp = await client.get(
                    f"{conn['endpoint']}/api/federation/remote/ping",
                    headers={"Authorization": f"Bearer {conn['token_theirs']}"},
                )
                if resp.status_code == 200:
                    reachable = True
                    data = resp.json()
                    remote_name = data.get("instance_name")
        except Exception:
            pass

        results.append({
            "id": str(conn["id"]),
            "name": conn["name"],
            "status": conn["status"],
            "reachable": reachable,
            "last_sync_at": conn["last_sync_at"],
            "remote_instance_name": remote_name,
        })

    return results


# ---- invite flow ----


@router.post("/invite", summary="Invite a remote instance to connect")
async def send_invite(
    payload: InviteRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> dict:
    """Initiate a federation handshake with a remote ClawControl instance.

    Generates a token for the remote to use when calling us, sends the invite,
    and stores the connection if the remote accepts.
    """
    our_token = secrets.token_urlsafe(32)

    # Derive our own callback URL from the incoming request
    our_endpoint = f"{request.url.scheme}://{request.headers['host']}"

    invite = ConnectionInvite(
        instance_id=get_instance_id(),
        instance_name=get_instance_name(),
        endpoint=our_endpoint,
        token_for_you=our_token,
    )

    try:
        async with httpx.AsyncClient(timeout=_REMOTE_TIMEOUT) as client:
            resp = await client.post(
                f"{payload.endpoint.rstrip('/')}/api/federation/remote/invite",
                json=invite.model_dump(),
            )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach remote instance: {e}")

    if resp.status_code == 409:
        raise HTTPException(status_code=409, detail="Remote instance reports already connected")
    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Remote instance rejected invite: {resp.status_code} {resp.text}",
        )

    accept = ConnectionAcceptResponse(**resp.json())

    # Check we're not already connected to this instance
    existing = db.execute(
        text("SELECT id FROM federation_connections WHERE instance_id = :iid"),
        {"iid": accept.instance_id},
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already connected to this instance")

    connection_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO federation_connections
                (id, name, instance_id, endpoint, token_theirs, token_ours, status)
            VALUES (:id, :name, :instance_id, :endpoint, :token_theirs, :token_ours, 'active')
            RETURNING id, name, instance_id, endpoint, status, agent_map, status_map,
                      created_at, last_sync_at
            """
        ),
        {
            "id": connection_id,
            "name": accept.instance_name,
            "instance_id": accept.instance_id,
            "endpoint": payload.endpoint.rstrip("/"),
            "token_theirs": accept.token_for_you,
            "token_ours": our_token,
        },
    ).mappings().one()
    db.commit()

    return _row_to_connection_out(dict(row))


# ---- remote endpoints (called by other ClawControl instances) ----


@router.post("/remote/invite", summary="Receive a federation invite from a remote instance")
async def receive_invite(
    payload: ConnectionInvite,
    db: Session = Depends(get_db),
) -> dict:
    """Accept an incoming federation invite. Auto-accepts in v1 (no approval flow).

    Returns connection details including a token for the remote to use when calling us.
    """
    # Check if already connected to this instance
    existing = db.execute(
        text("SELECT id FROM federation_connections WHERE instance_id = :iid"),
        {"iid": payload.instance_id},
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already connected to this instance")

    their_token = secrets.token_urlsafe(32)
    connection_id = str(uuid4())

    row = db.execute(
        text(
            """
            INSERT INTO federation_connections
                (id, name, instance_id, endpoint, token_theirs, token_ours, status)
            VALUES (:id, :name, :instance_id, :endpoint, :token_theirs, :token_ours, 'active')
            RETURNING id, name, instance_id, endpoint, status, agent_map, status_map,
                      created_at, last_sync_at
            """
        ),
        {
            "id": connection_id,
            "name": payload.instance_name,
            "instance_id": payload.instance_id,
            "endpoint": payload.endpoint.rstrip("/"),
            "token_theirs": payload.token_for_you,
            "token_ours": their_token,
        },
    ).mappings().one()
    db.commit()

    return ConnectionAcceptResponse(
        instance_id=get_instance_id(),
        instance_name=get_instance_name(),
        token_for_you=their_token,
        connection_id=connection_id,
    ).model_dump()


@router.post("/remote/disconnect", summary="Remote instance notifying disconnect")
async def remote_disconnect(
    conn: dict = Depends(verify_federation_token),
    db: Session = Depends(get_db),
) -> dict:
    """Handle a remote instance notifying us they are disconnecting. Marks the connection as broken."""
    db.execute(
        text(
            """
            UPDATE federation_connections
            SET status = 'broken'
            WHERE id = :id
            """
        ),
        {"id": conn["id"]},
    )
    db.commit()
    return {"status": "ok"}


@router.get("/remote/ping", summary="Federation health check ping")
async def remote_ping(
    conn: dict = Depends(verify_federation_token),
) -> dict:
    """Lightweight health check for remote instances to verify connectivity."""
    return {
        "instance_id": get_instance_id(),
        "instance_name": get_instance_name(),
        "status": "ok",
    }


# ---- sync queue management ----


@router.get("/queue", summary="List federation sync queue events")
async def list_queue(status: str | None = None, db: Session = Depends(get_db)) -> list[dict]:
    """List queued sync events. Optionally filter by status (pending, failed, delivered, expired)."""
    if status:
        rows = db.execute(
            text(
                """
                SELECT sq.id, sq.event_type, sq.attempts, sq.created_at,
                       sq.last_attempt_at, sq.status, fc.name AS connection_name
                FROM federation_sync_queue sq
                JOIN federation_connections fc ON fc.id = sq.connection_id
                WHERE sq.status = :status
                ORDER BY sq.created_at ASC
                """
            ),
            {"status": status},
        ).mappings().all()
    else:
        rows = db.execute(
            text(
                """
                SELECT sq.id, sq.event_type, sq.attempts, sq.created_at,
                       sq.last_attempt_at, sq.status, fc.name AS connection_name
                FROM federation_sync_queue sq
                JOIN federation_connections fc ON fc.id = sq.connection_id
                WHERE sq.status IN ('pending', 'failed')
                ORDER BY sq.created_at ASC
                """
            )
        ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/queue/process", summary="Manually trigger sync queue processing")
async def trigger_queue_process(db: Session = Depends(get_db)) -> dict:
    """Run the sync queue processor immediately. Also expires old events."""
    result = await process_sync_queue(db)
    expired = expire_old_events(db)
    result["expired"] = expired
    return result


@router.delete("/queue/clear", summary="Clear delivered and expired queue events")
async def clear_queue(db: Session = Depends(get_db)) -> dict:
    """Delete all delivered and expired events from the sync queue."""
    result = db.execute(
        text("DELETE FROM federation_sync_queue WHERE status IN ('delivered', 'expired')")
    )
    count = result.rowcount
    db.commit()
    return {"deleted": count}


# ---- remote task sync endpoints ----


@router.post("/remote/tasks/inbound", summary="Receive a shared task from a remote instance")
async def receive_inbound_task(
    payload: FederatedTask,
    conn: dict = Depends(verify_federation_token),
    db: Session = Depends(get_db),
) -> dict:
    """Accept an inbound shared task from a connected instance.

    Creates a local task and federation link. Rejects if already linked.
    """
    # Check if this remote task is already linked to this connection
    existing = db.execute(
        text(
            """
            SELECT id FROM federation_task_links
            WHERE remote_task_id = :rtid AND connection_id = :cid
            """
        ),
        {"rtid": payload.remote_task_id, "cid": conn["id"]},
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Task already linked from this connection")

    # Apply mappings: their values → our values
    agent_map = conn.get("agent_map") or {}
    status_map = conn.get("status_map") or {}
    local_status = _map_value(status_map, payload.status) or "inbox"
    local_assignee = _map_value(agent_map, payload.assignee)

    # Create local task
    task_id = str(uuid4())
    db.execute(
        text(
            """
            INSERT INTO tasks (
                id, title, summary, domain, type, status, priority,
                assignee_agent_id, worker_kind, payload_json, created_by
            ) VALUES (
                :id, :title, :summary, 'federation', 'task', :status, :priority,
                :assignee, 'openclaw_agent', :payload, :created_by
            )
            """
        ),
        {
            "id": task_id,
            "title": sanitise_title(payload.title),
            "summary": sanitise_text(payload.description or ""),
            "status": local_status,
            "priority": payload.priority or "medium",
            "assignee": local_assignee,
            "payload": json_param({"federation_source": str(conn["instance_id"])}),
            "created_by": f"federation:{conn['name']}",
        },
    )

    # Create federation link
    link_id = str(uuid4())
    db.execute(
        text(
            """
            INSERT INTO federation_task_links (id, local_task_id, remote_task_id, connection_id, direction)
            VALUES (:id, :local_task_id, :remote_task_id, :connection_id, 'inbound')
            """
        ),
        {
            "id": link_id,
            "local_task_id": task_id,
            "remote_task_id": payload.remote_task_id,
            "connection_id": conn["id"],
        },
    )
    db.commit()

    return {"local_task_id": task_id, "status": "accepted"}


@router.patch("/remote/tasks/{remote_task_id}/update", summary="Receive task update from remote instance")
async def receive_task_update(
    remote_task_id: str,
    payload: dict,
    conn: dict = Depends(verify_federation_token),
    db: Session = Depends(get_db),
) -> dict:
    """Receive a task update from a connected instance.

    If we are the originator (outbound), only status and assignee are applied.
    If we are the receiver (inbound), all fields are applied.
    """
    link = db.execute(
        text(
            """
            SELECT * FROM federation_task_links
            WHERE remote_task_id = :rtid AND connection_id = :cid
            """
        ),
        {"rtid": remote_task_id, "cid": conn["id"]},
    ).mappings().first()
    if not link:
        raise HTTPException(status_code=404, detail="Federation link not found")

    link = dict(link)
    agent_map = conn.get("agent_map") or {}
    status_map = conn.get("status_map") or {}

    set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"task_id": link["local_task_id"]}

    if link["direction"] == "outbound":
        # We originated this task — remote can only change status/assignee
        if "status" in payload and payload["status"]:
            set_clauses.append("status = :status")
            params["status"] = _map_value(status_map, payload["status"]) or payload["status"]
        if "assignee" in payload and payload["assignee"]:
            set_clauses.append("assignee_agent_id = :assignee")
            params["assignee"] = _map_value(agent_map, payload["assignee"]) or payload["assignee"]
    else:
        # We received this task — apply all fields from originator
        if "title" in payload and payload["title"]:
            set_clauses.append("title = :title")
            params["title"] = sanitise_title(payload["title"])
        if "description" in payload and payload["description"] is not None:
            set_clauses.append("summary = :summary")
            params["summary"] = sanitise_text(payload["description"])
        if "status" in payload and payload["status"]:
            set_clauses.append("status = :status")
            params["status"] = _map_value(status_map, payload["status"]) or payload["status"]
        if "priority" in payload and payload["priority"]:
            set_clauses.append("priority = :priority")
            params["priority"] = payload["priority"]
        if "assignee" in payload and payload["assignee"]:
            set_clauses.append("assignee_agent_id = :assignee")
            params["assignee"] = _map_value(agent_map, payload["assignee"]) or payload["assignee"]

    db.execute(
        text(
            f"""
            UPDATE tasks SET {', '.join(set_clauses)}
            WHERE id = :task_id
            """
        ),
        params,
    )

    # Update sync timestamp
    db.execute(
        text("UPDATE federation_task_links SET last_synced_at = CURRENT_TIMESTAMP WHERE id = :id"),
        {"id": link["id"]},
    )
    db.commit()

    return {"status": "ok"}


@router.post("/remote/tasks/{remote_task_id}/comment", summary="Receive comment on shared task", status_code=201)
async def receive_task_comment(
    remote_task_id: str,
    payload: FederatedComment,
    conn: dict = Depends(verify_federation_token),
    db: Session = Depends(get_db),
) -> dict:
    """Receive a comment from a connected instance on a shared task. Creates a local comment."""
    link = db.execute(
        text(
            """
            SELECT * FROM federation_task_links
            WHERE remote_task_id = :rtid AND connection_id = :cid
            """
        ),
        {"rtid": remote_task_id, "cid": conn["id"]},
    ).mappings().first()
    if not link:
        raise HTTPException(status_code=404, detail="Federation link not found")

    comment_id = str(uuid4())
    db.execute(
        text(
            """
            INSERT INTO comments (id, task_id, author_type, author_id, body)
            VALUES (:id, :task_id, 'system', :author_id, :body)
            """
        ),
        {
            "id": comment_id,
            "task_id": link["local_task_id"],
            "author_id": f"federation:{payload.author}",
            "body": sanitise_text(payload.content),
        },
    )
    db.commit()

    return {"comment_id": comment_id, "status": "created"}


@router.post("/remote/tasks/{remote_task_id}/unshare", summary="Remote instance unsharing a task")
async def receive_unshare(
    remote_task_id: str,
    conn: dict = Depends(verify_federation_token),
    db: Session = Depends(get_db),
) -> dict:
    """Handle a remote instance unsharing a task. Removes the federation link but keeps the local task."""
    db.execute(
        text(
            """
            DELETE FROM federation_task_links
            WHERE remote_task_id = :rtid AND connection_id = :cid
            """
        ),
        {"rtid": remote_task_id, "cid": conn["id"]},
    )
    db.commit()

    return {"status": "ok"}
