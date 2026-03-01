"""ClawControl instance identity.

Each ClawControl installation has a unique instance ID, generated on first run
and stored in config/instance.yaml. This ID is used in federation handshakes.
"""

from __future__ import annotations

import logging
import socket
from pathlib import Path
from uuid import uuid4

import yaml

logger = logging.getLogger(__name__)

_INSTANCE_PATH = Path(__file__).parent.parent.parent / "config" / "instance.yaml"
_cache: dict | None = None


def _load() -> dict:
    global _cache
    if _cache is not None:
        return _cache

    if _INSTANCE_PATH.exists():
        with open(_INSTANCE_PATH) as f:
            _cache = yaml.safe_load(f) or {}
        return _cache

    # First run — generate identity
    _cache = {
        "id": str(uuid4()),
        "name": socket.gethostname(),
    }
    _INSTANCE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_INSTANCE_PATH, "w") as f:
        f.write("# Auto-generated on first run. Do not delete.\n")
        yaml.dump(_cache, f, default_flow_style=False)
    logger.info("Generated instance ID: %s", _cache["id"])
    return _cache


def get_instance_id() -> str:
    """Return this ClawControl instance's unique ID."""
    return _load()["id"]


def get_instance_name() -> str:
    """Return this ClawControl instance's display name."""
    return _load().get("name", socket.gethostname())
