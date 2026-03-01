from __future__ import annotations

import json
import os
import plistlib
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import agent_config
from app.db import get_db
from app.settings import CRON_JOBS_PATH, CONFIG_PATH, AGENTS_DIR

router = APIRouter(prefix="/api/schedules", tags=["schedules"])

JOBS_FILE = CRON_JOBS_PATH
CONFIG_FILE = CONFIG_PATH
LAUNCH_AGENTS_DIR = Path.home() / "Library" / "LaunchAgents"
GUI_UID = os.getuid()

LAUNCHD_REGISTRY: dict[str, dict[str, Any]] = {
    "com.openclaw.data-collector-imessage": {"task": "iMessage Collector", "agent": "archive", "model": None, "schedule_human": "every 5 min"},
    "com.openclaw.data-collector-whatsapp": {"task": "WhatsApp Collector", "agent": "archive", "model": None, "schedule_human": "every 5 min"},
    "com.openclaw.data-collector-slack": {"task": "Slack Collector", "agent": "archive", "model": None, "schedule_human": "every 1 hr"},
    "com.openclaw.data-collector-calendar": {"task": "Calendar Collector", "agent": "archive", "model": None, "schedule_human": "every 1 hr"},
    "com.openclaw.email-collector": {"task": "Email Collector", "agent": "archive", "model": None, "schedule_human": "continuous"},
    "com.openclaw.data-collector-notes": {"task": "Notes Collector", "agent": "archive", "model": None, "schedule_human": "every 1 hr"},
    "com.openclaw.data-collector-photos": {"task": "Photos Collector", "agent": "archive", "model": None, "schedule_human": "daily"},
    "com.openclaw.transcript-distiller": {"task": "Transcript Distiller", "agent": "archive", "model": "Qwen3.5 35B A3B", "schedule_human": "3am daily"},
    "com.openclaw.health-collector": {"task": "Health Collector", "agent": "health", "model": None, "schedule_human": "every 15 min"},
    "com.openclaw.security-processor": {"task": "Security Processor", "agent": "security", "model": "Qwen3.5 35B A3B", "schedule_human": "event-driven"},
    "com.openclaw.backup-lancedb": {"task": "LanceDB Backup", "agent": "system", "model": None, "schedule_human": "daily"},
    "com.openclaw.backup-secrets": {"task": "Secrets Backup", "agent": "system", "model": None, "schedule_human": "daily"},
    "com.openclaw.backup-mc-db": {"task": "MC Database Backup", "agent": "system", "model": None, "schedule_human": "daily"},
    "com.openclaw.backup-paperless": {"task": "Paperless Backup", "agent": "system", "model": None, "schedule_human": "daily"},
    "com.openclaw.lance-compact": {"task": "Lance Compaction", "agent": "system", "model": None, "schedule_human": "daily"},
    "com.openclaw.scrapling-mcp": {"task": "Scrapling MCP", "agent": "system", "model": None, "schedule_human": "continuous"},
    "com.openclaw.token-monitor": {"task": "Token Monitor", "agent": "system", "model": None, "schedule_human": "continuous"},
    "com.openclaw.mission-control-backend": {"task": "ClawControl Backend", "agent": "system", "model": None, "schedule_human": "continuous"},
    "com.openclaw.mission-control-ui": {"task": "ClawControl Frontend", "agent": "system", "model": None, "schedule_human": "continuous"},
}

# Model display name mapping
MODEL_DISPLAY: dict[str, str] = {
    "local-ollama/kimi-k2.5:cloud": "Kimi K2.5",
    "ollama-cloud/kimi-k2.5": "Kimi K2.5",
    "local-ai/Qwen3.5-35B-A3B-Q8_0.gguf": "Qwen3.5 35B A3B",
    "dgx-spark/Qwen3.5-122B-A10B-UD-Q6_K_XL.gguf": "Qwen3.5 122B A10B",
    "anthropic/claude-opus-4-6": "Opus 4.6",
    "anthropic/claude-sonnet-4-6": "Sonnet 4.6",
    "openai/gpt-5.2": "GPT-5.2",
}

STATUS_ORDER = {"error": 0, "late": 1, "running": 2, "ok": 3, "idle": 4, "disabled": 5}


def _ms_to_iso(ms: int | None) -> str | None:
    if ms is None:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _mtime_to_iso(path: str) -> str | None:
    """Get file modification time as ISO timestamp."""
    try:
        p = Path(path)
        if p.exists():
            mtime = p.stat().st_mtime
            return datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    except OSError:
        pass
    return None


def _cron_schedule_human(job: dict) -> str:
    sched = job.get("schedule", {})
    kind = sched.get("kind", "cron")
    if kind == "at":
        return f"once at {sched.get('at', '?')}"
    expr = sched.get("expr", "")
    # Common patterns
    if expr == "12 * * * *":
        return "hourly at :12"
    if expr == "*/15 * * * *":
        return "every 15 min"
    if expr.startswith("0 */"):
        hours = expr.split()[1].replace("*/", "")
        return f"every {hours} hrs"
    if expr.startswith("30 */"):
        hours = expr.split()[1].replace("*/", "")
        return f"every {hours} hrs at :30"
    return expr


def _cron_status(job: dict) -> str:
    if not job.get("enabled", True):
        return "disabled"
    state = job.get("state", {})
    sched = job.get("schedule", {})
    now_ms = int(time.time() * 1000)
    # One-shot jobs that already ran
    if sched.get("kind") == "at" and state.get("lastRunAtMs"):
        return "idle"
    if state.get("lastStatus") == "error":
        return "error"
    next_ms = state.get("nextRunAtMs")
    if next_ms and next_ms < now_ms:
        return "late"
    return "ok"


def _read_cron_jobs() -> list[dict[str, Any]]:
    if not JOBS_FILE.exists():
        return []
    data = json.loads(JOBS_FILE.read_text())
    jobs = data.get("jobs", [])
    results = []
    for job in jobs:
        model_raw = job.get("payload", {}).get("model", "")
        model = MODEL_DISPLAY.get(model_raw, model_raw) if model_raw else None
        sched = job.get("schedule", {})
        state = job.get("state", {})
        results.append({
            "id": f"cron:{job['id']}",
            "task": job.get("name", "Unnamed Job"),
            "agent": job.get("agentId"),
            "model": model,
            "schedule": sched.get("expr", sched.get("at", "")),
            "schedule_human": _cron_schedule_human(job),
            "last_run_at": _ms_to_iso(state.get("lastRunAtMs")),
            "last_status": state.get("lastStatus"),
            "next_run_at": _ms_to_iso(state.get("nextRunAtMs")),
            "status": _cron_status(job),
            "source": "cron",
            "detail": {
                "enabled": job.get("enabled", True),
                "schedule_kind": sched.get("kind"),
                "schedule_tz": sched.get("tz"),
                "wake_mode": job.get("wakeMode"),
                "session_target": job.get("sessionTarget"),
                "consecutive_errors": state.get("consecutiveErrors", 0),
                "last_duration_ms": state.get("lastDurationMs"),
                "last_error": state.get("lastError"),
                "delete_after_run": job.get("deleteAfterRun", False),
            },
        })
    return results


def _parse_launchctl_print(label: str) -> dict[str, Any] | None:
    """Run `launchctl print gui/{uid}/{label}` and parse the output."""
    try:
        result = subprocess.run(
            ["launchctl", "print", f"gui/{GUI_UID}/{label}"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return None
        output = result.stdout
    except (subprocess.SubprocessError, OSError):
        return None

    info: dict[str, Any] = {}

    # Parse key fields from output (tab-indented key = value lines)
    m = re.search(r"^\tstate = (.+)$", output, re.MULTILINE)
    if m:
        info["state"] = m.group(1).strip()

    m = re.search(r"^\truns = (\d+)$", output, re.MULTILINE)
    if m:
        info["runs"] = int(m.group(1))

    m = re.search(r"^\tlast exit code = (.+)$", output, re.MULTILINE)
    if m:
        raw = m.group(1).strip()
        if raw == "(never exited)":
            info["last_exit_code"] = None
        else:
            try:
                info["last_exit_code"] = int(raw)
            except ValueError:
                info["last_exit_code"] = raw

    m = re.search(r"^\trun interval = (\d+) seconds$", output, re.MULTILINE)
    if m:
        info["run_interval"] = int(m.group(1))

    m = re.search(r"^\tstdout path = (.+)$", output, re.MULTILINE)
    if m:
        info["stdout_path"] = m.group(1).strip()

    m = re.search(r"^\tstderr path = (.+)$", output, re.MULTILINE)
    if m:
        info["stderr_path"] = m.group(1).strip()

    return info


def _next_calendar_interval(cal: dict) -> str | None:
    """Calculate the next occurrence of a StartCalendarInterval from now."""
    now = datetime.now(timezone.utc)
    hour = cal.get("Hour", 0)
    minute = cal.get("Minute", 0)

    # Daily job at specific hour:minute
    if "Hour" in cal and "Day" not in cal and "Weekday" not in cal and "Month" not in cal:
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if candidate <= now:
            candidate += timedelta(days=1)
        return candidate.isoformat()

    # Weekly job
    if "Weekday" in cal:
        target_weekday = cal["Weekday"]  # 0=Sun in launchd
        # Python: 0=Mon, 6=Sun; launchd: 0=Sun, 1=Mon...6=Sat
        py_weekday = (target_weekday - 1) % 7
        days_ahead = (py_weekday - now.weekday()) % 7
        candidate = now.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
        if candidate <= now:
            candidate += timedelta(weeks=1)
        return candidate.isoformat()

    return None


def _read_launchd_services() -> list[dict[str, Any]]:
    """Read running launchd services with com.openclaw prefix."""
    try:
        result = subprocess.run(
            ["launchctl", "list"],
            capture_output=True, text=True, timeout=5
        )
        lines = result.stdout.strip().split("\n")
    except (subprocess.SubprocessError, OSError):
        return []

    # Collect labels with basic info from launchctl list
    services: list[dict[str, Any]] = []
    for line in lines:
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        label = parts[2]
        if not label.startswith("com.openclaw."):
            continue

        pid_str = parts[0]
        exit_status_str = parts[1]
        pid = None if pid_str == "-" else int(pid_str)
        exit_status = int(exit_status_str) if exit_status_str.lstrip("-").isdigit() else 0

        services.append({
            "label": label,
            "pid": pid,
            "exit_status": exit_status,
        })

    results = []
    for svc in services:
        label = svc["label"]
        pid = svc["pid"]
        exit_status = svc["exit_status"]

        # Try launchctl print for richer data
        print_info = _parse_launchctl_print(label)

        # Registry lookup (graceful for unknown services)
        registry = LAUNCHD_REGISTRY.get(label, {})
        task_name = registry.get("task", label.removeprefix("com.openclaw.").replace("-", " ").title())
        agent = registry.get("agent")
        model = registry.get("model")
        schedule_human = registry.get("schedule_human")

        # Override with launchctl print data where available
        stdout_path = None
        stderr_path = None
        runs = None
        schedule_expr = ""
        interval_seconds: int | None = None
        calendar_interval: dict | None = None

        if print_info:
            stdout_path = print_info.get("stdout_path")
            stderr_path = print_info.get("stderr_path")
            runs = print_info.get("runs")

            # Use print state for more accurate status
            state_str = print_info.get("state", "")
            if state_str == "running":
                status = "running"
            elif print_info.get("last_exit_code") is not None and print_info["last_exit_code"] != 0:
                status = "error"
                exit_status = print_info["last_exit_code"]
            elif exit_status != 0:
                status = "error"
            else:
                status = "ok"

            # Run interval for schedule expression
            interval_seconds = print_info.get("run_interval")
            if interval_seconds:
                schedule_expr = f"every {interval_seconds}s"
                if not schedule_human:
                    if interval_seconds < 120:
                        schedule_human = f"every {interval_seconds}s"
                    elif interval_seconds < 7200:
                        schedule_human = f"every {interval_seconds // 60} min"
                    else:
                        schedule_human = f"every {interval_seconds // 3600} hrs"

            # Also read plist for StartCalendarInterval (not available in launchctl print)
            plist_path = LAUNCH_AGENTS_DIR / f"{label}.plist"
            if plist_path.exists() and not interval_seconds:
                try:
                    with open(plist_path, "rb") as f:
                        plist = plistlib.load(f)
                    if "StartCalendarInterval" in plist:
                        cal = plist["StartCalendarInterval"]
                        if isinstance(cal, dict):
                            calendar_interval = cal
                            schedule_expr = _format_calendar_interval(cal)
                        elif isinstance(cal, list) and cal:
                            calendar_interval = cal[0]
                            schedule_expr = _format_calendar_interval(cal[0])
                except Exception:
                    pass
        else:
            # Fallback: read plist for log paths and schedule
            plist_path = LAUNCH_AGENTS_DIR / f"{label}.plist"
            if plist_path.exists():
                try:
                    with open(plist_path, "rb") as f:
                        plist = plistlib.load(f)
                    stdout_path = plist.get("StandardOutPath")
                    stderr_path = plist.get("StandardErrorPath")
                    if "StartInterval" in plist:
                        interval_seconds = plist["StartInterval"]
                        schedule_expr = f"every {interval_seconds}s"
                    elif "StartCalendarInterval" in plist:
                        cal = plist["StartCalendarInterval"]
                        if isinstance(cal, dict):
                            calendar_interval = cal
                            schedule_expr = _format_calendar_interval(cal)
                        elif isinstance(cal, list) and cal:
                            calendar_interval = cal[0]
                            schedule_expr = _format_calendar_interval(cal[0])
                except Exception:
                    pass

            # Fallback status from launchctl list
            if pid is not None:
                status = "running"
            elif exit_status != 0:
                status = "error"
            else:
                status = "ok"

        if not schedule_human:
            schedule_human = schedule_expr or "unknown"

        # last_run_at from stdout log mtime
        last_run_at = _mtime_to_iso(stdout_path) if stdout_path else None

        # Calculate next_run_at
        next_run_at: str | None = None
        if interval_seconds and last_run_at:
            # Interval-based: next = last + interval
            last_dt = datetime.fromisoformat(last_run_at)
            next_dt = last_dt + timedelta(seconds=interval_seconds)
            next_run_at = next_dt.isoformat()
        elif calendar_interval:
            # Calendar-based: compute next occurrence from now
            next_run_at = _next_calendar_interval(calendar_interval)

        # last_status
        if status == "running":
            last_status = "running"
        elif exit_status != 0:
            last_status = "error"
        elif last_run_at:
            last_status = "ok"
        else:
            last_status = None

        results.append({
            "id": f"launchd:{label}",
            "task": task_name,
            "agent": agent,
            "model": model,
            "schedule": schedule_expr,
            "schedule_human": schedule_human,
            "last_run_at": last_run_at,
            "last_status": last_status,
            "next_run_at": next_run_at,
            "status": status,
            "source": "launchd",
            "detail": {
                "label": label,
                "pid": pid,
                "exit_status": exit_status,
                "runs": runs,
                "stdout_path": stdout_path,
                "stderr_path": stderr_path,
            },
        })
    return results


def _format_calendar_interval(cal: dict) -> str:
    parts = []
    if "Month" in cal:
        parts.append(f"month={cal['Month']}")
    if "Day" in cal:
        parts.append(f"day={cal['Day']}")
    if "Weekday" in cal:
        parts.append(f"weekday={cal['Weekday']}")
    if "Hour" in cal:
        parts.append(f"hour={cal['Hour']}")
    if "Minute" in cal:
        parts.append(f"min={cal['Minute']}")
    return " ".join(parts) if parts else "calendar"


def _model_display_name(model: Any) -> str | None:
    """Extract a friendly display name from a model config value."""
    if model is None or model == "default":
        return None
    if isinstance(model, str):
        return MODEL_DISPLAY.get(model, model)
    if isinstance(model, dict):
        primary = model.get("primary", "")
        return MODEL_DISPLAY.get(primary, primary)
    return None


# AGENTS_DIR imported from app.settings


def _parse_interval_seconds(every: str) -> int | None:
    """Parse interval string like '15m', '1h' into seconds."""
    m = re.match(r"^(\d+)\s*(m|min|h|hr|s)$", every.strip())
    if not m:
        return None
    val = int(m.group(1))
    unit = m.group(2)
    if unit in ("m", "min"):
        return val * 60
    if unit in ("h", "hr"):
        return val * 3600
    return val


def _get_heartbeat_timing(agent_id: str) -> tuple[str | None, str | None]:
    """Get last_run_at from the most recent session file for an agent."""
    sessions_dir = AGENTS_DIR / agent_id / "sessions"
    if not sessions_dir.exists():
        return None, None
    # Find most recently modified jsonl
    jsonl_files = sorted(sessions_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not jsonl_files:
        return None, None
    latest = jsonl_files[0]
    mtime = latest.stat().st_mtime
    last_run = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    return last_run, None


def _read_heartbeat_entries() -> list[dict[str, Any]]:
    """Read heartbeat configs from openclaw.json agent list."""
    if not CONFIG_FILE.exists():
        return []
    try:
        config = json.loads(CONFIG_FILE.read_text())
    except Exception:
        return []

    agent_list = config.get("agents", {}).get("list", [])
    entries = []
    for agent in agent_list:
        if not isinstance(agent, dict):
            continue
        hb = agent.get("heartbeat")
        if not hb:
            continue
        aid = agent.get("id", "unknown")
        name = agent_config.get_agent(aid).get("name", agent.get("name", aid))
        every = hb.get("every", "?")
        model = _model_display_name(agent.get("model"))

        last_run_at, _ = _get_heartbeat_timing(aid)

        # Calculate next_run_at from last_run + interval
        next_run_at = None
        interval_secs = _parse_interval_seconds(every)
        if last_run_at and interval_secs:
            last_dt = datetime.fromisoformat(last_run_at)
            next_dt = last_dt + timedelta(seconds=interval_secs)
            next_run_at = next_dt.isoformat()

        # Determine status
        status = "ok"
        if last_run_at and interval_secs:
            now = datetime.now(timezone.utc)
            last_dt = datetime.fromisoformat(last_run_at)
            elapsed = (now - last_dt).total_seconds()
            if elapsed > interval_secs * 3:
                status = "error"
            elif elapsed > interval_secs * 1.5:
                status = "late"

        entries.append({
            "id": f"heartbeat:{aid}",
            "task": f"{name} Heartbeat",
            "agent": aid,
            "model": model,
            "schedule": every,
            "schedule_human": f"every {every}",
            "last_run_at": last_run_at,
            "last_status": "ok" if last_run_at else None,
            "next_run_at": next_run_at,
            "status": status,
            "source": "heartbeat",
            "detail": {"interval": every},
        })
    return entries


def _sort_key(entry: dict) -> tuple:
    status_rank = STATUS_ORDER.get(entry["status"], 99)
    next_run = entry.get("next_run_at") or "9999"
    return (status_rank, next_run)


@router.get("", summary="List all schedules")
async def list_schedules() -> list[dict[str, Any]]:
    """Return all scheduled jobs from cron, launchd, and agent heartbeats, sorted by status urgency."""
    entries: list[dict[str, Any]] = []
    entries.extend(_read_cron_jobs())
    entries.extend(_read_launchd_services())
    entries.extend(_read_heartbeat_entries())
    entries.sort(key=_sort_key)
    return entries


@router.get("/{schedule_id:path}", summary="Get schedule detail")
async def get_schedule_detail(
    schedule_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return detailed schedule info including config, log tails, and recent activity."""
    # Find the entry first
    all_entries = []
    all_entries.extend(_read_cron_jobs())
    all_entries.extend(_read_launchd_services())
    all_entries.extend(_read_heartbeat_entries())

    entry = next((e for e in all_entries if e["id"] == schedule_id), None)
    if not entry:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # Enrich based on source
    config: dict[str, Any] = {}
    recent_runs: list[dict[str, Any]] = []
    log_tail: str | None = None
    activities: list[dict] = []

    if entry["source"] == "cron":
        # Full job config from jobs.json
        raw_id = schedule_id.removeprefix("cron:")
        if JOBS_FILE.exists():
            data = json.loads(JOBS_FILE.read_text())
            for job in data.get("jobs", []):
                if job["id"] == raw_id:
                    config = job
                    break

    elif entry["source"] == "launchd":
        label = entry["detail"].get("label", "")
        plist_path = LAUNCH_AGENTS_DIR / f"{label}.plist"
        if plist_path.exists():
            try:
                with open(plist_path, "rb") as f:
                    plist = plistlib.load(f)
                # Convert plist to JSON-safe dict
                config = _plist_to_dict(plist)
            except Exception:
                pass

        # Read log tails
        log_parts = []
        for log_key in ("stdout_path", "stderr_path"):
            log_path = entry["detail"].get(log_key)
            if log_path and Path(log_path).exists():
                try:
                    result = subprocess.run(
                        ["tail", "-20", log_path],
                        capture_output=True, text=True, timeout=5
                    )
                    if result.stdout.strip():
                        header = "STDOUT" if "stdout" in log_key else "STDERR"
                        log_parts.append(f"--- {header} ({log_path}) ---\n{result.stdout.strip()}")
                except Exception:
                    pass
        if log_parts:
            log_tail = "\n\n".join(log_parts)

    elif entry["source"] == "heartbeat":
        pass

    # Fetch recent MC activity for the agent
    agent_id = entry.get("agent")
    if agent_id:
        try:
            rows = db.execute(
                text(
                    """
                    SELECT id, type, priority, source, agent_id, title, summary, created_at
                    FROM activity_log
                    WHERE agent_id = :agent_id
                    ORDER BY created_at DESC
                    LIMIT 10
                    """
                ),
                {"agent_id": agent_id},
            ).mappings().all()
            activities = [dict(r) for r in rows]
        except Exception:
            pass

    return {
        **entry,
        "config": config,
        "recent_runs": recent_runs,
        "log_tail": log_tail,
        "activities": activities,
    }


def _plist_to_dict(obj: Any) -> Any:
    """Convert plist objects to JSON-serializable types."""
    if isinstance(obj, dict):
        return {k: _plist_to_dict(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_plist_to_dict(v) for v in obj]
    if isinstance(obj, bytes):
        return obj.hex()
    if isinstance(obj, datetime):
        return obj.isoformat()
    return obj
