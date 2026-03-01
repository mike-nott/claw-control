from __future__ import annotations

import os
import stat
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Base directory — all OpenClaw paths derive from this
OPENCLAW_HOME = Path(os.getenv("OPENCLAW_HOME", str(Path.home() / ".openclaw")))

# SQLite database path
# SQLite lives in data/ within the ClawControl repo
_SCRIPT_DIR = Path(__file__).resolve().parent.parent  # backend/
_DB_DIR = _SCRIPT_DIR.parent / "data"
_DB_DIR.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{_DB_DIR / 'clawcontrol.db'}",
)

# Set database file permissions to owner-only (600)
_db_path = Path(DATABASE_URL.replace("sqlite:///", ""))
if _db_path.exists():
    os.chmod(_db_path, stat.S_IRUSR | stat.S_IWUSR)

# Config files
CONFIG_PATH = OPENCLAW_HOME / "openclaw.json"
CRON_JOBS_PATH = OPENCLAW_HOME / "cron" / "jobs.json"

# Workspace
WORKSPACE_PATH = OPENCLAW_HOME / "workspace"

# Agents
AGENTS_DIR = OPENCLAW_HOME / "agents"

# Data storage
DATA_DIR = OPENCLAW_HOME / "data"
ATTACHMENT_ROOT = DATA_DIR / "task-attachments"

# ClawControl directory (falls back to mission-control/ for existing installs)
_cc_dir = Path(__file__).resolve().parent.parent.parent  # claw-control/
MC_DIR = _cc_dir if _cc_dir.is_dir() else OPENCLAW_HOME / "mission-control"
