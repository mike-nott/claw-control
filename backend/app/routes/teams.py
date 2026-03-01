from __future__ import annotations

from collections import defaultdict
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.events import broker
from app.models import MEMBER_STATUSES, MEMBER_TYPES
from app.utils.sanitise import sanitise_title, sanitise_text
from app.schemas import (
    MemberCreateIn,
    MemberPatchIn,
    TeamCreateIn,
    TeamPatchIn,
)


router = APIRouter(tags=["teams"])


# ---- helpers ----

def _fetch_team_or_404(db: Session, team_id: str) -> dict[str, Any]:
    row = db.execute(
        text("SELECT * FROM teams WHERE id = :id"), {"id": team_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Team not found")
    return dict(row)


def _fetch_member_or_404(db: Session, member_id: str) -> dict[str, Any]:
    row = db.execute(
        text("SELECT * FROM team_members WHERE id = :id"), {"id": member_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")
    return dict(row)


def _validate_member_type(member_type: str) -> None:
    if member_type not in MEMBER_TYPES:
        raise HTTPException(status_code=422, detail="Invalid member type")


def _validate_member_status(status: str) -> None:
    if status not in MEMBER_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid member status")


def _insert_activity(
    db: Session,
    *,
    task_id: str | None,
    agent_id: str | None,
    activity_type: str,
    summary: str,
    detail_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    from app.db import json_param

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


# ---- teams ----

@router.get("/api/teams", summary="List teams")
async def list_teams(db: Session = Depends(get_db)) -> list[dict]:
    """Return all teams with member counts."""
    rows = db.execute(
        text(
            """
            SELECT t.*,
                   COUNT(tm.id) AS member_count
            FROM teams t
            LEFT JOIN team_members tm ON tm.team_id = t.id
            GROUP BY t.id
            ORDER BY t.created_at
            """
        )
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/api/teams", summary="Create a team")
async def create_team(
    payload: TeamCreateIn, db: Session = Depends(get_db)
) -> dict:
    """Create a new team."""
    team_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO teams (id, name, description, mm_team_id, icon, is_local)
            VALUES (:id, :name, :description, :mm_team_id, :icon, :is_local)
            RETURNING *
            """
        ),
        {
            "id": team_id,
            "name": sanitise_title(payload.name),
            "description": sanitise_text(payload.description or ""),
            "mm_team_id": payload.mm_team_id,
            "icon": payload.icon,
            "is_local": payload.is_local,
        },
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="team.created",
        summary=f"Team created: {payload.name}",
    )
    db.commit()

    team = dict(row)
    await broker.publish("team.created", team)
    await broker.publish("activity.created", activity)
    return team


@router.get("/api/teams/{team_id}", summary="Get team with members")
async def get_team(team_id: str, db: Session = Depends(get_db)) -> dict:
    """Return team details including all members."""
    team = _fetch_team_or_404(db, team_id)
    members = db.execute(
        text("SELECT * FROM team_members WHERE team_id = :tid ORDER BY name"),
        {"tid": team_id},
    ).mappings().all()
    team["members"] = [dict(m) for m in members]
    return team


@router.patch("/api/teams/{team_id}", summary="Update a team")
async def patch_team(
    team_id: str, payload: TeamPatchIn, db: Session = Depends(get_db)
) -> dict:
    """Partially update team fields."""
    existing = _fetch_team_or_404(db, team_id)
    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        updates["name"] = sanitise_title(updates["name"])
    if "description" in updates and updates["description"] is not None:
        updates["description"] = sanitise_text(updates["description"])

    if not updates:
        return existing

    set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"team_id": team_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE teams
            SET {', '.join(set_clauses)}
            WHERE id = :team_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="team.updated",
        summary=f"Team updated: {row['name']}",
        detail_json={"updated_fields": sorted(list(updates.keys()))},
    )
    db.commit()

    team = dict(row)
    await broker.publish("team.updated", team)
    await broker.publish("activity.created", activity)
    return team


@router.delete("/api/teams/{team_id}", summary="Delete a team")
async def delete_team(team_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a team and its members. Projects are unlinked, not deleted."""
    existing = _fetch_team_or_404(db, team_id)
    # Nullify projects.team_id before cascade deletes members
    db.execute(
        text("UPDATE projects SET team_id = NULL WHERE team_id = :tid"),
        {"tid": team_id},
    )
    db.execute(text("DELETE FROM teams WHERE id = :tid"), {"tid": team_id})
    db.commit()
    await broker.publish("team.deleted", existing)
    return {"deleted": True, "id": team_id}


# ---- members ----

@router.get("/api/teams/{team_id}/members", summary="List team members")
async def list_team_members(
    team_id: str,
    category: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[dict]:
    """List members of a team, optionally filtered by category."""
    _fetch_team_or_404(db, team_id)

    if category:
        rows = db.execute(
            text(
                """
                SELECT * FROM team_members
                WHERE team_id = :tid AND category = :category
                ORDER BY name
                """
            ),
            {"tid": team_id, "category": category},
        ).mappings().all()
    else:
        rows = db.execute(
            text("SELECT * FROM team_members WHERE team_id = :tid ORDER BY name"),
            {"tid": team_id},
        ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/api/teams/{team_id}/members", summary="Add a team member")
async def create_member(
    team_id: str, payload: MemberCreateIn, db: Session = Depends(get_db)
) -> dict:
    """Add a new member (agent or human) to a team."""
    _fetch_team_or_404(db, team_id)
    _validate_member_type(payload.type)
    _validate_member_status(payload.status)

    member_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO team_members
                (id, team_id, agent_id, name, mm_username, mm_user_id,
                 role, bio, type, category, model_tier, status, avatar_url)
            VALUES
                (:id, :team_id, :agent_id, :name, :mm_username, :mm_user_id,
                 :role, :bio, :type, :category, :model_tier, :status, :avatar_url)
            RETURNING *
            """
        ),
        {
            "id": member_id,
            "team_id": team_id,
            "agent_id": payload.agent_id,
            "name": sanitise_title(payload.name),
            "mm_username": payload.mm_username,
            "mm_user_id": payload.mm_user_id,
            "role": sanitise_title(payload.role or ""),
            "bio": sanitise_text(payload.bio or ""),
            "type": payload.type,
            "category": payload.category,
            "model_tier": payload.model_tier,
            "status": payload.status,
            "avatar_url": payload.avatar_url,
        },
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="member.created",
        summary=f"Member added: {payload.name}",
        detail_json={"team_id": team_id},
    )
    db.commit()

    member = dict(row)
    await broker.publish("member.created", member)
    await broker.publish("activity.created", activity)
    return member


# ---- roster / lookup (must come before {member_id} routes) ----

@router.get("/api/members/roster", summary="Full team roster")
async def member_roster(db: Session = Depends(get_db)) -> list[dict]:
    """Return all teams with members grouped by category. Used for the org chart view."""
    rows = db.execute(
        text(
            """
            SELECT t.id AS team_id, t.name AS team_name, t.icon,
                   tm.id AS member_id, tm.name, tm.agent_id, tm.role,
                   tm.type, tm.category, tm.model_tier, tm.status,
                   tm.mm_username, tm.avatar_url
            FROM teams t
            JOIN team_members tm ON tm.team_id = t.id
            ORDER BY t.name, CASE WHEN tm.category IS NULL THEN 1 ELSE 0 END, tm.category, tm.name
            """
        )
    ).mappings().all()

    teams: dict[str, dict] = {}
    for row in rows:
        tid = str(row["team_id"])
        if tid not in teams:
            teams[tid] = {
                "team_id": tid,
                "team_name": row["team_name"],
                "icon": row["icon"],
                "categories": defaultdict(list),
            }
        category = row["category"] or "uncategorised"
        teams[tid]["categories"][category].append(
            {
                "member_id": str(row["member_id"]),
                "name": row["name"],
                "agent_id": row["agent_id"],
                "role": row["role"],
                "type": row["type"],
                "model_tier": row["model_tier"],
                "status": row["status"],
                "mm_username": row["mm_username"],
                "avatar_url": row["avatar_url"],
            }
        )

    # Convert defaultdicts to regular dicts for JSON serialisation
    result = []
    for team in teams.values():
        team["categories"] = dict(team["categories"])
        result.append(team)
    return result


@router.get("/api/members/by-mm/{username}", summary="Find member by username")
async def member_by_mm_username(
    username: str, db: Session = Depends(get_db)
) -> dict:
    """Look up a team member by their messaging username."""
    row = db.execute(
        text("SELECT * FROM team_members WHERE mm_username = :username"),
        {"username": username},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Member not found")
    return dict(row)


# ---- individual member CRUD (after static /api/members/* routes) ----

@router.get("/api/members/{member_id}", summary="Get member by ID")
async def get_member(member_id: str, db: Session = Depends(get_db)) -> dict:
    """Return a single team member."""
    return _fetch_member_or_404(db, member_id)


@router.patch("/api/members/{member_id}", summary="Update a member")
async def patch_member(
    member_id: str, payload: MemberPatchIn, db: Session = Depends(get_db)
) -> dict:
    """Partially update member fields."""
    existing = _fetch_member_or_404(db, member_id)
    updates = payload.model_dump(exclude_unset=True)

    if "type" in updates and updates["type"] is not None:
        _validate_member_type(updates["type"])
    if "status" in updates and updates["status"] is not None:
        _validate_member_status(updates["status"])
    if "name" in updates and updates["name"] is not None:
        updates["name"] = sanitise_title(updates["name"])
    if "role" in updates and updates["role"] is not None:
        updates["role"] = sanitise_title(updates["role"])
    if "bio" in updates and updates["bio"] is not None:
        updates["bio"] = sanitise_text(updates["bio"])

    if not updates:
        return existing

    set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"member_id": member_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE team_members
            SET {', '.join(set_clauses)}
            WHERE id = :member_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="member.updated",
        summary=f"Member updated: {row['name']}",
        detail_json={"updated_fields": sorted(list(updates.keys()))},
    )
    db.commit()

    member = dict(row)
    await broker.publish("member.updated", member)
    await broker.publish("activity.created", activity)
    return member


@router.delete("/api/members/{member_id}", summary="Remove a member")
async def delete_member(member_id: str, db: Session = Depends(get_db)) -> dict:
    """Remove a member from their team."""
    existing = _fetch_member_or_404(db, member_id)
    db.execute(text("DELETE FROM team_members WHERE id = :mid"), {"mid": member_id})
    db.commit()
    await broker.publish("member.deleted", existing)
    return {"deleted": True, "id": member_id}


# ---- team projects ----

@router.get("/api/teams/{team_id}/projects", summary="List team projects")
async def list_team_projects(
    team_id: str, db: Session = Depends(get_db)
) -> list[dict]:
    """List all projects belonging to a team with board counts and task summaries."""
    _fetch_team_or_404(db, team_id)
    project_rows = db.execute(
        text(
            """
            SELECT p.*, COUNT(DISTINCT b.id) AS board_count
            FROM projects p
            LEFT JOIN boards b ON b.project_id = p.id
            WHERE p.team_id = :tid
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """
        ),
        {"tid": team_id},
    ).mappings().all()

    result = []
    for row in project_rows:
        project = dict(row)
        summary_rows = db.execute(
            text("SELECT status, COUNT(*) AS cnt FROM tasks WHERE project_id = :pid GROUP BY status"),
            {"pid": project["id"]},
        ).mappings().all()
        project["task_summary"] = {r["status"]: r["cnt"] for r in summary_rows}
        result.append(project)
    return result
