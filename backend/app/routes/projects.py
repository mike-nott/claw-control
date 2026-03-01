from __future__ import annotations

from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.events import broker
from app.models import PROJECT_STATUSES
from app.utils.sanitise import sanitise_title, sanitise_text
from app.schemas import (
    BoardCreateIn,
    BoardPatchIn,
    ProjectCreateIn,
    ProjectCredentialCreateIn,
    ProjectCredentialPatchIn,
    ProjectPatchIn,
)


router = APIRouter(tags=["projects"])


# ---- helpers ----

def _fetch_project_or_404(db: Session, project_id: str) -> dict[str, Any]:
    row = db.execute(
        text("SELECT * FROM projects WHERE id = :id"), {"id": project_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(row)


def _fetch_board_or_404(db: Session, board_id: str) -> dict[str, Any]:
    row = db.execute(
        text("SELECT * FROM boards WHERE id = :id"), {"id": board_id}
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Board not found")
    return dict(row)


def _validate_project_status(status: str) -> None:
    if status not in PROJECT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid project status")


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


# ---- helpers: multi-team ----

def _get_project_teams(db: Session, project_id: str) -> list[dict[str, str]]:
    """Return list of {id, name} for teams assigned to a project."""
    rows = db.execute(
        text(
            """
            SELECT t.id, t.name, t.icon
            FROM project_teams pt
            JOIN teams t ON t.id = pt.team_id
            WHERE pt.project_id = :pid
            ORDER BY t.name
            """
        ),
        {"pid": project_id},
    ).mappings().all()
    return [dict(r) for r in rows]


def _set_project_teams(db: Session, project_id: str, team_ids: list[str]) -> None:
    """Replace all team associations for a project."""
    db.execute(
        text("DELETE FROM project_teams WHERE project_id = :pid"),
        {"pid": project_id},
    )
    for tid in team_ids:
        db.execute(
            text("INSERT INTO project_teams (project_id, team_id) VALUES (:pid, :tid)"),
            {"pid": project_id, "tid": tid},
        )


def _enrich_project(db: Session, project: dict) -> dict:
    """Add teams array to a project dict."""
    project["teams"] = _get_project_teams(db, project["id"])
    return project


# ---- projects ----

@router.get("/api/projects", summary="List projects")
async def list_projects(
    team_id: str | None = Query(None),
    db: Session = Depends(get_db),
) -> list[dict]:
    """List all projects with board counts and task status summaries. Optionally filter by team."""
    if team_id:
        where = "WHERE p.id IN (SELECT project_id FROM project_teams WHERE team_id = :team_id)"
    else:
        where = ""
    params: dict[str, Any] = {}
    if team_id:
        params["team_id"] = team_id

    project_rows = db.execute(
        text(
            f"""
            SELECT p.*, COUNT(DISTINCT b.id) AS board_count
            FROM projects p
            LEFT JOIN boards b ON b.project_id = p.id
            {where}
            GROUP BY p.id
            ORDER BY p.created_at DESC
            """
        ),
        params,
    ).mappings().all()

    result = []
    for row in project_rows:
        project = dict(row)
        summary_rows = db.execute(
            text("SELECT status, COUNT(*) AS cnt FROM tasks WHERE project_id = :pid GROUP BY status"),
            {"pid": project["id"]},
        ).mappings().all()
        project["task_summary"] = {r["status"]: r["cnt"] for r in summary_rows}
        _enrich_project(db, project)
        result.append(project)
    return result


@router.post("/api/projects", summary="Create a project")
async def create_project(
    payload: ProjectCreateIn, db: Session = Depends(get_db)
) -> dict:
    """Create a new project for organising boards and tasks."""
    _validate_project_status(payload.status)

    project_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO projects (id, name, description, status, owner, github_repo, discord_server, discord_channel)
            VALUES (:id, :name, :description, :status, :owner, :github_repo, :discord_server, :discord_channel)
            RETURNING *
            """
        ),
        {
            "id": project_id,
            "name": sanitise_title(payload.name),
            "description": sanitise_text(payload.description or ""),
            "status": payload.status,
            "owner": payload.owner,
            "github_repo": payload.github_repo,
            "discord_server": payload.discord_server,
            "discord_channel": payload.discord_channel,
        },
    ).mappings().one()

    # Set team associations
    if payload.team_ids:
        _set_project_teams(db, project_id, payload.team_ids)

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="project.created",
        summary=f"Project created: {payload.name}",
    )
    db.commit()

    project = dict(row)
    _enrich_project(db, project)
    await broker.publish("project.created", project)
    await broker.publish("activity.created", activity)
    return project


@router.get("/api/projects/{project_id}", summary="Get project with boards")
async def get_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    """Return project details including all boards and their task summaries."""
    project = _fetch_project_or_404(db, project_id)
    _enrich_project(db, project)

    board_rows = db.execute(
        text(
            """
            SELECT b.*
            FROM boards b
            WHERE b.project_id = :pid
            ORDER BY b.position, b.created_at
            """
        ),
        {"pid": project_id},
    ).mappings().all()

    boards = []
    for b in board_rows:
        board = dict(b)
        summary_rows = db.execute(
            text("SELECT status, COUNT(*) AS cnt FROM tasks WHERE board_id = :bid GROUP BY status"),
            {"bid": board["id"]},
        ).mappings().all()
        board["task_summary"] = {r["status"]: r["cnt"] for r in summary_rows}
        boards.append(board)
    project["boards"] = boards
    return project


@router.patch("/api/projects/{project_id}", summary="Update a project")
async def patch_project(
    project_id: str, payload: ProjectPatchIn, db: Session = Depends(get_db)
) -> dict:
    """Partially update project fields."""
    existing = _fetch_project_or_404(db, project_id)
    updates = payload.model_dump(exclude_unset=True)

    # Handle team_ids separately — not a column on the projects table
    team_ids = updates.pop("team_ids", None)

    if "status" in updates and updates["status"] is not None:
        _validate_project_status(updates["status"])

    if "name" in updates and updates["name"] is not None:
        updates["name"] = sanitise_title(updates["name"])
    if "description" in updates and updates["description"] is not None:
        updates["description"] = sanitise_text(updates["description"])

    if updates:
        set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
        params: dict[str, Any] = {"project_id": project_id}

        for key, value in updates.items():
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

        row = db.execute(
            text(
                f"""
                UPDATE projects
                SET {', '.join(set_clauses)}
                WHERE id = :project_id
                RETURNING *
                """
            ),
            params,
        ).mappings().one()
        project = dict(row)
    else:
        project = existing

    # Update team associations if provided
    if team_ids is not None:
        _set_project_teams(db, project_id, team_ids)

    if updates or team_ids is not None:
        updated_fields = sorted(list(updates.keys()))
        if team_ids is not None:
            updated_fields.append("teams")
        activity = _insert_activity(
            db,
            task_id=None,
            agent_id=None,
            activity_type="project.updated",
            summary=f"Project updated: {project['name']}",
            detail_json={"updated_fields": updated_fields},
        )
        db.commit()
        await broker.publish("activity.created", activity)
    else:
        _enrich_project(db, project)
        return project

    _enrich_project(db, project)
    await broker.publish("project.updated", project)
    return project


@router.delete("/api/projects/{project_id}", summary="Delete a project")
async def delete_project(project_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a project and its boards. Tasks are unlinked, not deleted."""
    existing = _fetch_project_or_404(db, project_id)
    # Nullify project_id and board_id on tasks before cascade deletes boards
    db.execute(
        text(
            """
            UPDATE tasks SET project_id = NULL, board_id = NULL
            WHERE project_id = :pid
            """
        ),
        {"pid": project_id},
    )
    db.execute(text("DELETE FROM projects WHERE id = :pid"), {"pid": project_id})
    db.commit()
    await broker.publish("project.deleted", existing)
    return {"deleted": True, "id": project_id}


# ---- boards ----

@router.get("/api/projects/{project_id}/boards", summary="List boards")
async def list_boards(project_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """List all boards in a project with task status summaries."""
    _fetch_project_or_404(db, project_id)
    board_rows = db.execute(
        text(
            """
            SELECT b.*
            FROM boards b
            WHERE b.project_id = :pid
            ORDER BY b.position, b.created_at
            """
        ),
        {"pid": project_id},
    ).mappings().all()

    result = []
    for b in board_rows:
        board = dict(b)
        summary_rows = db.execute(
            text("SELECT status, COUNT(*) AS cnt FROM tasks WHERE board_id = :bid GROUP BY status"),
            {"bid": board["id"]},
        ).mappings().all()
        board["task_summary"] = {r["status"]: r["cnt"] for r in summary_rows}
        result.append(board)
    return result


@router.post("/api/projects/{project_id}/boards", summary="Create a board")
async def create_board(
    project_id: str, payload: BoardCreateIn, db: Session = Depends(get_db)
) -> dict:
    """Create a new board within a project."""
    _fetch_project_or_404(db, project_id)

    board_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO boards (id, project_id, name, description, position)
            VALUES (:id, :project_id, :name, :description, :position)
            RETURNING *
            """
        ),
        {
            "id": board_id,
            "project_id": project_id,
            "name": sanitise_title(payload.name),
            "description": sanitise_text(payload.description or ""),
            "position": payload.position,
        },
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="board.created",
        summary=f"Board created: {payload.name}",
    )
    db.commit()

    board = dict(row)
    await broker.publish("board.created", board)
    await broker.publish("activity.created", activity)
    return board


@router.get("/api/boards/{board_id}", summary="Get board by ID")
async def get_board(board_id: str, db: Session = Depends(get_db)) -> dict:
    """Return board details with task status summary."""
    board = _fetch_board_or_404(db, board_id)
    # Add task summary
    summary_rows = db.execute(
        text(
            """
            SELECT status, COUNT(*) AS cnt
            FROM tasks
            WHERE board_id = :bid
            GROUP BY status
            """
        ),
        {"bid": board_id},
    ).mappings().all()
    board["task_summary"] = {r["status"]: r["cnt"] for r in summary_rows}
    return board


@router.patch("/api/boards/{board_id}", summary="Update a board")
async def patch_board(
    board_id: str, payload: BoardPatchIn, db: Session = Depends(get_db)
) -> dict:
    """Partially update board fields."""
    existing = _fetch_board_or_404(db, board_id)
    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] is not None:
        updates["name"] = sanitise_title(updates["name"])
    if "description" in updates and updates["description"] is not None:
        updates["description"] = sanitise_text(updates["description"])

    if not updates:
        return existing

    set_clauses = ["updated_at = CURRENT_TIMESTAMP"]
    params: dict[str, Any] = {"board_id": board_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE boards
            SET {', '.join(set_clauses)}
            WHERE id = :board_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()

    activity = _insert_activity(
        db,
        task_id=None,
        agent_id=None,
        activity_type="board.updated",
        summary=f"Board updated: {row['name']}",
        detail_json={"updated_fields": sorted(list(updates.keys()))},
    )
    db.commit()

    board = dict(row)
    await broker.publish("board.updated", board)
    await broker.publish("activity.created", activity)
    return board


@router.delete("/api/boards/{board_id}", summary="Delete a board")
async def delete_board(board_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a board. Tasks are unlinked from the board, not deleted."""
    existing = _fetch_board_or_404(db, board_id)
    # Nullify board_id on tasks
    db.execute(
        text("UPDATE tasks SET board_id = NULL WHERE board_id = :bid"),
        {"bid": board_id},
    )
    db.execute(text("DELETE FROM boards WHERE id = :bid"), {"bid": board_id})
    db.commit()
    await broker.publish("board.deleted", existing)
    return {"deleted": True, "id": board_id}


# ---- project credentials ----


def _fetch_credential_or_404(db: Session, credential_id: str) -> dict[str, Any]:
    row = db.execute(
        text("SELECT * FROM project_credentials WHERE id = :id"),
        {"id": credential_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Credential not found")
    return dict(row)


def _check_credential_access(db: Session, project_id: str, agent_id: str | None) -> None:
    """Check agent has team-based access to project credentials.

    If no agent_id is provided (UI/human access), access is allowed.
    If agent_id is provided, check that the agent belongs to at least one
    team assigned to the project.
    """
    if not agent_id:
        return  # UI/human access — always allowed

    # Find teams the agent belongs to
    agent_teams = db.execute(
        text(
            """
            SELECT team_id FROM team_members
            WHERE agent_id = :agent_id
            """
        ),
        {"agent_id": agent_id},
    ).mappings().all()
    agent_team_ids = {r["team_id"] for r in agent_teams}

    if not agent_team_ids:
        raise HTTPException(
            status_code=403,
            detail=f"Agent '{agent_id}' is not a member of any team",
        )

    # Check if any of the agent's teams are assigned to this project
    project_team_ids = {t["id"] for t in _get_project_teams(db, project_id)}

    if not project_team_ids:
        return  # No teams assigned to project — open access

    if not agent_team_ids & project_team_ids:
        raise HTTPException(
            status_code=403,
            detail=f"Agent '{agent_id}' does not belong to any team assigned to this project",
        )


@router.get("/api/projects/{project_id}/credentials", summary="List project credentials")
async def list_credentials(
    project_id: str,
    db: Session = Depends(get_db),
    x_agent_id: str | None = Header(None),
) -> list[dict]:
    """List all credentials for a project."""
    _fetch_project_or_404(db, project_id)
    _check_credential_access(db, project_id, x_agent_id)
    rows = db.execute(
        text(
            """
            SELECT * FROM project_credentials
            WHERE project_id = :pid
            ORDER BY created_at
            """
        ),
        {"pid": project_id},
    ).mappings().all()
    return [dict(r) for r in rows]


@router.post("/api/projects/{project_id}/credentials", summary="Create a credential")
async def create_credential(
    project_id: str,
    payload: ProjectCredentialCreateIn,
    db: Session = Depends(get_db),
    x_agent_id: str | None = Header(None),
) -> dict:
    """Create a new credential for a project."""
    _fetch_project_or_404(db, project_id)
    _check_credential_access(db, project_id, x_agent_id)

    credential_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO project_credentials (id, project_id, label, value)
            VALUES (:id, :project_id, :label, :value)
            RETURNING *
            """
        ),
        {
            "id": credential_id,
            "project_id": project_id,
            "label": payload.label,
            "value": payload.value,
        },
    ).mappings().one()
    db.commit()
    return dict(row)


@router.patch(
    "/api/projects/{project_id}/credentials/{credential_id}",
    summary="Update a credential",
)
async def patch_credential(
    project_id: str,
    credential_id: str,
    payload: ProjectCredentialPatchIn,
    db: Session = Depends(get_db),
    x_agent_id: str | None = Header(None),
) -> dict:
    """Partially update a credential."""
    _fetch_project_or_404(db, project_id)
    _check_credential_access(db, project_id, x_agent_id)
    existing = _fetch_credential_or_404(db, credential_id)
    updates = payload.model_dump(exclude_unset=True)

    if not updates:
        return existing

    set_clauses = ["updated_at = datetime('now')"]
    params: dict[str, Any] = {"credential_id": credential_id, "project_id": project_id}

    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE project_credentials
            SET {', '.join(set_clauses)}
            WHERE id = :credential_id AND project_id = :project_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()
    db.commit()
    return dict(row)


@router.delete(
    "/api/projects/{project_id}/credentials/{credential_id}",
    summary="Delete a credential",
)
async def delete_credential(
    project_id: str,
    credential_id: str,
    db: Session = Depends(get_db),
    x_agent_id: str | None = Header(None),
) -> dict:
    """Delete a credential."""
    _fetch_project_or_404(db, project_id)
    _check_credential_access(db, project_id, x_agent_id)
    _fetch_credential_or_404(db, credential_id)
    db.execute(
        text("DELETE FROM project_credentials WHERE id = :id AND project_id = :pid"),
        {"id": credential_id, "pid": project_id},
    )
    db.commit()
    return {"deleted": True, "id": credential_id}
