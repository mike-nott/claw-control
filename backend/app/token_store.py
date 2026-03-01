from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app import agent_config

logger = logging.getLogger(__name__)

AGENTS_DIR = Path(
    os.environ.get(
        "OPENCLAW_AGENTS_DIR",
        str(Path.home() / ".openclaw" / "agents"),
    )
)
VALID_RANGES = {"1h", "today", "7d", "30d"}
LOCAL_TZ = ZoneInfo(os.environ.get("CLAWCONTROL_TIMEZONE", "UTC"))

# Fallback model→provider mapping for entries missing a provider field.
# Add your models here if the JSONL entries don't include a provider.
MODEL_PROVIDER_FALLBACK: dict[str, str] = {
    "claude-opus-4-6": "anthropic",
    "claude-opus-4-5": "anthropic",
    "claude-sonnet-4-6": "anthropic",
    "claude-sonnet-4-5": "anthropic",
    "claude-haiku-4-5": "anthropic",
}


class TTLCache:
    def __init__(self) -> None:
        self._items: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        item = self._items.get(key)
        if not item:
            return None
        expires_at, value = item
        if time.time() >= expires_at:
            self._items.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any, ttl_seconds: int) -> None:
        self._items[key] = (time.time() + ttl_seconds, value)


@dataclass
class RangeWindow:
    key: str
    start_utc: datetime
    end_utc: datetime


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_ts(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def as_int(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, bool):
        return 0
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value)
        except ValueError:
            return 0
    return 0


def as_float(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return 0.0
    return 0.0


def get_range_window(range_key: str) -> RangeWindow:
    if range_key not in VALID_RANGES:
        raise HTTPException(status_code=400, detail=f"Invalid range '{range_key}'")

    now_utc = datetime.now(timezone.utc)
    now_london = now_utc.astimezone(LOCAL_TZ)

    if range_key == "1h":
        start = now_utc - timedelta(hours=1)
    elif range_key == "today":
        london_midnight = now_london.replace(hour=0, minute=0, second=0, microsecond=0)
        start = london_midnight.astimezone(timezone.utc)
    elif range_key == "7d":
        start = now_utc - timedelta(days=7)
    else:
        start = now_utc - timedelta(days=30)

    return RangeWindow(key=range_key, start_utc=start, end_utc=now_utc)


def bucket_granularity(range_key: str) -> str:
    if range_key == "1h":
        return "minute"
    if range_key == "today":
        return "15min"
    if range_key == "7d":
        return "hour"
    return "day"


def floor_bucket(dt_utc: datetime, granularity: str) -> datetime:
    if granularity == "minute":
        return dt_utc.replace(second=0, microsecond=0)
    if granularity == "15min":
        minute = (dt_utc.minute // 15) * 15
        return dt_utc.replace(minute=minute, second=0, microsecond=0)
    if granularity == "hour":
        return dt_utc.replace(minute=0, second=0, microsecond=0)
    return dt_utc.replace(hour=0, minute=0, second=0, microsecond=0)


def next_bucket(dt_utc: datetime, granularity: str) -> datetime:
    if granularity == "minute":
        return dt_utc + timedelta(minutes=1)
    if granularity == "15min":
        return dt_utc + timedelta(minutes=15)
    if granularity == "hour":
        return dt_utc + timedelta(hours=1)
    return dt_utc + timedelta(days=1)


class DataStore:
    def __init__(self) -> None:
        self._rows_cache = TTLCache()

    def map_logical_agent(self, session_key: Any, agent_id: Any = None, provider: Any = None) -> str:
        sk = session_key if isinstance(session_key, str) else ""

        # 1. Map by agentId via agents.yaml config
        if isinstance(agent_id, str) and agent_id in agent_config.get_all_agents():
            return agent_config.get_display_name(agent_id)

        # 3. Map cron job IDs to agent IDs (session keys like agent:main:cron:<jobId>:run:...)
        # Add your cron job ID prefixes here to map them to agent display names.
        # Example: "abcd1234": "system",  # System Status Check
        cron_job_agent_map: dict[str, str] = {}
        if ":cron:" in sk:
            for job_prefix, cron_agent_id in cron_job_agent_map.items():
                if job_prefix in sk:
                    return agent_config.get_display_name(cron_agent_id)
            return "Cron"

        # 4. Pattern match on hook session keys (fallback)
        if "hook:security" in sk or "hook:alarm" in sk:
            return agent_config.get_display_name("security")
        if "hook:home" in sk:
            return agent_config.get_display_name("home")
        if "hook:system" in sk:
            return agent_config.get_display_name("system")
        if "hook:" in sk:
            return "Hooks"

        # 5. agentId "main" without hook/cron = actual Main session
        if isinstance(agent_id, str) and agent_id == "main":
            return agent_config.get_display_name("main")

        return "Other"

    def _scan_jsonl_files(self, window: RangeWindow) -> list[dict[str, Any]]:
        """Scan JSONL session files for usage entries within the time window."""
        rows: list[dict[str, Any]] = []
        start_epoch = window.start_utc.timestamp()

        if not AGENTS_DIR.is_dir():
            logger.warning("Agents directory not found: %s", AGENTS_DIR)
            return rows

        for agent_dir in AGENTS_DIR.iterdir():
            if not agent_dir.is_dir():
                continue
            agent_id = agent_dir.name
            sessions_dir = agent_dir / "sessions"
            if not sessions_dir.is_dir():
                continue

            for jsonl_file in sessions_dir.iterdir():
                # Skip non-jsonl and deleted files
                if not jsonl_file.name.endswith(".jsonl") or ".deleted." in jsonl_file.name:
                    continue

                # Skip files not modified within the range (optimisation)
                try:
                    mtime = jsonl_file.stat().st_mtime
                except OSError:
                    continue
                if mtime < start_epoch:
                    continue

                session_id = jsonl_file.stem
                session_key = f"agent:{agent_id}:session:{session_id}"

                try:
                    with jsonl_file.open("r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if not line:
                                continue
                            try:
                                entry = json.loads(line)
                            except json.JSONDecodeError:
                                continue

                            msg = entry.get("message")
                            if not isinstance(msg, dict):
                                continue
                            if msg.get("role") != "assistant":
                                continue
                            usage = msg.get("usage")
                            if not isinstance(usage, dict):
                                continue
                            total_tokens = as_int(usage.get("totalTokens"))
                            if total_tokens == 0:
                                continue

                            ts = parse_ts(entry.get("timestamp"))
                            if ts is None:
                                continue
                            if ts < window.start_utc or ts > window.end_utc:
                                continue

                            input_tokens = as_int(usage.get("input"))
                            output_tokens = as_int(usage.get("output"))
                            cache_read = as_int(usage.get("cacheRead"))
                            cache_write = as_int(usage.get("cacheWrite"))

                            model = msg.get("model") if isinstance(msg.get("model"), str) else "unknown"
                            provider = msg.get("provider") if isinstance(msg.get("provider"), str) else None
                            if not provider:
                                provider = MODEL_PROVIDER_FALLBACK.get(model, "unknown")

                            cost_obj = usage.get("cost")
                            cost_total = 0.0
                            if isinstance(cost_obj, dict):
                                cost_total = as_float(cost_obj.get("total"))

                            rows.append(
                                {
                                    "ts": ts,
                                    "bucketTs": iso_z(ts),
                                    "sessionKey": session_key,
                                    "logicalAgent": self.map_logical_agent(session_key, agent_id, provider),
                                    "agentId": agent_id,
                                    "modelProvider": provider,
                                    "model": model,
                                    "inputTokens": input_tokens,
                                    "outputTokens": output_tokens,
                                    "cacheReadTokens": cache_read,
                                    "cacheWriteTokens": cache_write,
                                    "total": input_tokens + output_tokens + cache_read + cache_write,
                                    "contextTokens": 0,
                                    "costTotal": cost_total,
                                }
                            )
                except OSError as exc:
                    logger.warning("Error reading %s: %s", jsonl_file, exc)
                    continue

        return rows

    def load_rows_for_range(self, range_key: str) -> list[dict[str, Any]]:
        # Check row-level cache first
        cached = self._rows_cache.get(f"rows:{range_key}")
        if cached is not None:
            return cached

        window = get_range_window(range_key)
        rows = self._scan_jsonl_files(window)

        # TTL: short for live data, longer for historical
        ttl = 10 if range_key in ("1h", "today") else 60
        self._rows_cache.set(f"rows:{range_key}", rows, ttl)

        return rows


store = DataStore()
api_cache = TTLCache()
