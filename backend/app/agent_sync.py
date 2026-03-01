"""Sync agents from openclaw.json into the agents table on startup."""
from __future__ import annotations

import json
import logging

from sqlalchemy import text

from app.db import SessionLocal
from app.settings import CONFIG_PATH

logger = logging.getLogger(__name__)


def sync_agents_from_config() -> None:
    try:
        raw = CONFIG_PATH.read_text(encoding="utf-8")
        config = json.loads(raw)
    except (OSError, json.JSONDecodeError):
        logger.warning("Could not read %s — skipping agent sync", CONFIG_PATH)
        return

    agents_list = config.get("agents", {}).get("list", [])
    if not isinstance(agents_list, list) or not agents_list:
        logger.warning("No agents.list found in config — skipping agent sync")
        return

    db = SessionLocal()
    try:
        for agent in agents_list:
            agent_id = agent.get("id")
            if not agent_id:
                continue
            identity = agent.get("identity", {})
            name = identity.get("name") or agent.get("name") or agent_id
            emoji = identity.get("emoji")

            db.execute(
                text(
                    """
                    INSERT INTO agents (id, name, kind, emoji, status, updated_at)
                    VALUES (:id, :name, 'openclaw_agent', :emoji, 'idle', CURRENT_TIMESTAMP)
                    ON CONFLICT (id) DO UPDATE SET name = :name, emoji = :emoji, updated_at = CURRENT_TIMESTAMP
                    """
                ),
                {"id": agent_id, "name": name, "emoji": emoji},
            )
        db.commit()
        logger.info("Synced %d agents from openclaw.json", len(agents_list))
    except Exception:
        logger.exception("Agent sync failed")
        db.rollback()
    finally:
        db.close()
