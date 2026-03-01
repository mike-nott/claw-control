"""Agent configuration loader for ClawControl."""

from __future__ import annotations

import logging
from pathlib import Path
import yaml

logger = logging.getLogger(__name__)

_CONFIG_PATH = Path(__file__).parent.parent.parent / "config" / "agents.yaml"
_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is None:
        try:
            with open(_CONFIG_PATH) as f:
                _cache = yaml.safe_load(f) or {}
        except FileNotFoundError:
            logger.warning("agents.yaml not found at %s — using empty config", _CONFIG_PATH)
            _cache = {}
        except Exception:
            logger.exception("Failed to load agents.yaml")
            _cache = {}
    return _cache


def get_agent(agent_id: str) -> dict:
    """Get agent config by ID. Returns defaults for unknown agents."""
    cfg = _load()
    agents = cfg.get("agents", {})
    if agent_id in agents:
        return agents[agent_id]
    return {
        "name": cfg.get("default_name", "Agent"),
        "emoji": cfg.get("default_emoji", "\U0001f916"),
        "team": cfg.get("default_team", "Other"),
        "title": "",
        "bio": "",
    }


def get_display_name(agent_id: str) -> str:
    """Get display name for an agent (name only, no emoji)."""
    a = get_agent(agent_id)
    return a["name"]


def get_display_order() -> list[str]:
    """Get the configured display order."""
    return _load().get("display_order", [])


def get_all_agents() -> dict[str, dict]:
    """Get all configured agents."""
    return _load().get("agents", {})


def reload() -> None:
    """Force reload config from disk."""
    global _cache
    _cache = None
