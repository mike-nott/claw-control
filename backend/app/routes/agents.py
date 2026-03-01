from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import agent_config
from app.db import get_db
from app.events import broker
from app.schemas import AgentHeartbeatIn
from app.settings import CONFIG_PATH, CRON_JOBS_PATH, WORKSPACE_PATH
from app.access_matrix import ACCESS_MATRIX, MEMORY_KEYS, DATA_STORE_KEYS, TOOL_KEYS, EXTERNAL_TOOL_KEYS


router = APIRouter(prefix="/api/agents", tags=["agents"])

CRON_PATH = CRON_JOBS_PATH

MAIN_DEFAULTS = {
    "workspace": str(WORKSPACE_PATH),
    "model": {"primary": "anthropic/claude-opus-4-6", "fallbacks": []},
    "tools": [],  # main has no restrictions — display as "All tools"
}

ALLOWED_WORKSPACE_FILES = {"SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "HEARTBEAT.md", "USER.md", "MEMORY.md"}


@router.get("", summary="List agents with config")
async def list_agents_config() -> list[dict]:
    """Return all agents with their identity, model config, tools, heartbeat, cron jobs, and access matrix. Reads live from openclaw.json."""
    # Load openclaw.json
    config = json.loads(CONFIG_PATH.read_text())
    agents_cfg = config.get("agents", {})
    agents_list = agents_cfg.get("list", [])
    agents_defaults = agents_cfg.get("defaults", {})
    default_model = agents_defaults.get("model")  # shared fallback chain
    default_workspace = agents_defaults.get("workspace") or MAIN_DEFAULTS["workspace"]
    default_heartbeat = agents_defaults.get("heartbeat", {})

    # Load cron jobs, index by agentId
    cron_jobs_by_agent: dict[str, list] = {}
    try:
        cron_data = json.loads(CRON_PATH.read_text())
        for job in cron_data.get("jobs", []):
            aid = job.get("agentId")
            if aid:
                cron_jobs_by_agent.setdefault(aid, []).append(job)
    except Exception:
        pass

    # If any agent has a per-agent heartbeat block, only those agents get heartbeats
    any_per_agent_heartbeat = any(a.get("heartbeat") for a in agents_list)

    result = []
    for agent in agents_list:
        agent_id = agent.get("id", "")
        identity = agent.get("identity", {})

        # Resolve model: agent-specific → agents.defaults.model → MAIN_DEFAULTS
        is_main = agent.get("default", False)
        model_raw = agent.get("model") or default_model or (MAIN_DEFAULTS["model"] if is_main else None)
        workspace = agent.get("workspace") or (default_workspace if is_main else None)
        tools_allow = agent.get("tools", {}).get("allow", []) if agent.get("tools") else (None if is_main else [])

        # Build model dict
        model = None
        if model_raw:
            if isinstance(model_raw, dict):
                model = {"primary": model_raw.get("primary"), "fallbacks": model_raw.get("fallbacks", [])}
            else:
                model = {"primary": str(model_raw), "fallbacks": []}

        # Build cron jobs
        cron_jobs = []
        for job in cron_jobs_by_agent.get(agent_id, []):
            state = job.get("state", {})
            schedule = job.get("schedule", {})
            cron_jobs.append({
                "id": job.get("id"),
                "name": job.get("name"),
                "schedule_expr": schedule.get("expr"),
                "enabled": job.get("enabled", False),
                "last_run_at": datetime.fromtimestamp(state["lastRunAtMs"] / 1000, tz=timezone.utc).isoformat() if state.get("lastRunAtMs") else None,
                "last_status": state.get("lastStatus"),
                "next_run_at": datetime.fromtimestamp(state["nextRunAtMs"] / 1000, tz=timezone.utc).isoformat() if state.get("nextRunAtMs") else None,
            })

        # Access matrix
        matrix = ACCESS_MATRIX.get(agent_id, {})
        access = {
            "memory": {k: matrix.get("memory", {}).get(k) for k in MEMORY_KEYS},
            "data_stores": {k: matrix.get("data_stores", {}).get(k) for k in DATA_STORE_KEYS},
            "tools": {k: matrix.get("tools", {}).get(k) for k in TOOL_KEYS},
            "external_tools": {k: matrix.get("external_tools", {}).get(k) for k in EXTERNAL_TOOL_KEYS},
        }

        meta = agent_config.get_agent(agent_id)
        result.append({
            "id": agent_id,
            "name": identity.get("name") or agent.get("name") or meta.get("name", agent_id),
            "emoji": identity.get("emoji") or meta.get("emoji"),
            "default": is_main,
            "team": meta.get("team", "Workers"),
            "title": meta.get("title", ""),
            "bio": meta.get("bio", ""),
            "workspace": workspace,
            "model": model,
            "tools": tools_allow,  # None = all tools (main), [] = none, [...] = listed tools
            "skills": agent.get("skills", []),
            "heartbeat": agent.get("heartbeat") or (None if any_per_agent_heartbeat else default_heartbeat) or None,
            "cron_jobs": cron_jobs,
            "access": access,
        })

    display_order = agent_config.get_display_order()
    order_map = {id_: i for i, id_ in enumerate(display_order)}
    result.sort(key=lambda a: order_map.get(a["id"], len(display_order)))
    return result


@router.get("/{agent_id}/file/{filename}", summary="Get agent workspace file")
async def get_agent_file(agent_id: str, filename: str) -> dict:
    """Read a file from an agent's workspace directory. Only whitelisted filenames are allowed."""
    if filename not in ALLOWED_WORKSPACE_FILES:
        raise HTTPException(status_code=400, detail=f"File '{filename}' not in allowed list")

    # Get workspace path from config
    config = json.loads(CONFIG_PATH.read_text())
    agents_list = config.get("agents", {}).get("list", [])
    agent = next((a for a in agents_list if a.get("id") == agent_id), None)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    is_main = agent.get("default", False)
    workspace = agent.get("workspace") or (str(WORKSPACE_PATH) if is_main else None)
    if not workspace:
        return {"content": None, "exists": False}

    file_path = Path(workspace) / filename
    if not file_path.exists():
        return {"content": None, "exists": False}

    return {"content": file_path.read_text(encoding="utf-8"), "exists": True}


@router.get("/{agent_id}", summary="Get agent status")
async def get_agent(agent_id: str, db: Session = Depends(get_db)) -> dict:
    """Return agent status and last-seen info from the database."""
    row = db.execute(text("SELECT * FROM agents WHERE id = :agent_id"), {"agent_id": agent_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")
    return dict(row)


@router.post("/{agent_id}/heartbeat", summary="Agent heartbeat")
async def heartbeat_agent(agent_id: str, payload: AgentHeartbeatIn, db: Session = Depends(get_db)) -> dict:
    """Update agent status and last_seen_at timestamp. Called periodically by agents."""
    row = db.execute(
        text(
            """
            UPDATE agents
            SET status = :status,
                last_seen_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = :agent_id
            RETURNING *
            """
        ),
        {"agent_id": agent_id, "status": payload.status},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Agent not found")

    db.commit()
    result = dict(row)
    await broker.publish("agent.liveness", result)
    return result
