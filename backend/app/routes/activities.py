from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db


router = APIRouter(prefix="/api/activities", tags=["activities"])


@router.get("", summary="List task activities")
async def list_activities(
    task_id: str | None = None,
    agent_id: str | None = None,
    domain: str | None = None,
    since: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[dict]:
    """List task timeline activities. Filter by task_id to get a specific task's history, or by agent_id/domain for broader queries."""
    params: dict[str, Any] = {"limit": limit}
    clauses = []

    if task_id:
        clauses.append("a.task_id = :task_id")
        params["task_id"] = task_id
    if agent_id:
        clauses.append("a.agent_id = :agent_id")
        params["agent_id"] = agent_id
    if since:
        clauses.append("a.created_at >= :since")
        params["since"] = since
    if domain:
        clauses.append("t.domain = :domain")
        params["domain"] = domain

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    rows = db.execute(
        text(
            f"""
            SELECT a.*
            FROM activities a
            LEFT JOIN tasks t ON a.task_id = t.id
            {where_sql}
            ORDER BY a.created_at DESC
            LIMIT :limit
            """
        ),
        params,
    ).mappings().all()

    return [dict(row) for row in rows]
