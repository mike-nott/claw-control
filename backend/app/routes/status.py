from __future__ import annotations

import asyncio
import json as _json
import re
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import psutil
from fastapi import APIRouter

from app.settings import AGENTS_DIR as _AGENTS_DIR

router = APIRouter(prefix="/api", tags=["status"])

PROBE_TIMEOUT = 5.0

# LLM servers to probe. Each entry needs: name, host, port, runtime.
# Optional: glances_host + glances_gpu_index for GPU telemetry via Glances API.
# Supported runtimes: "llama.cpp", "vLLM", "Ollama"
LLM_SERVERS: list[dict] = [
    # {"name": "GPU Server", "host": "192.168.1.10", "port": 8080, "runtime": "llama.cpp", "glances_host": "192.168.1.10", "glances_gpu_index": 0},
    # {"name": "Cloud Server", "host": "192.168.1.20", "port": 8000, "runtime": "vLLM"},
    # {"name": "Local Ollama", "host": "localhost", "port": 11434, "runtime": "Ollama"},
]

GLANCES_PORT = 61208

# Services to health-check. Use "url" for HTTP checks, or "host"+"port" for TCP checks.
SERVICES: list[dict] = [
    # {"name": "Home Assistant", "url": "http://homeassistant.local:8123/api/", "headers": {"Authorization": "Bearer YOUR_TOKEN"}},
    # {"name": "Voice Server", "host": "192.168.1.30", "port": 10300},
    {"name": "ClawControl", "url": "http://127.0.0.1:8088/api/health"},
]


# ── Prometheus text parser ────────────────────────

_PROM_LINE = re.compile(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)\{?[^}]*\}?\s+([\d.eE+\-]+)")


def parse_prometheus(text: str) -> dict[str, float]:
    """Parse Prometheus text format into {metric_name: value}."""
    result: dict[str, float] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = _PROM_LINE.match(line)
        if m:
            try:
                result[m.group(1)] = float(m.group(2))
            except ValueError:
                pass
    return result


# ── LLM server probes ────────────────────────────

# Module-level state for activity detection
_prev_gen_tokens: dict[str, int] = {}  # key: "host:port" -> previous gen_tokens_total


async def _probe_llm_server(client: httpx.AsyncClient, server: dict) -> dict:
    host, port, runtime = server["host"], server["port"], server["runtime"]
    base = f"http://{host}:{port}"
    entry: dict = {
        "name": server["name"],
        "host": host,
        "port": port,
        "runtime": runtime,
        "status": "down",
        "active": False,
        "model": None,
        "response_ms": None,
        "metrics": None,
        "glances": None,
    }

    try:
        # Probe model info
        t0 = asyncio.get_event_loop().time()
        if runtime == "Ollama":
            r = await client.get(f"{base}/api/tags")
            r.raise_for_status()
            data = r.json()
            models = data.get("models", [])
            entry["model"] = models[0]["name"] if models else None
            entry["status"] = "ok"
        else:
            r = await client.get(f"{base}/v1/models")
            r.raise_for_status()
            data = r.json()
            models = data.get("data", [])
            entry["model"] = models[0]["id"] if models else None
            entry["status"] = "ok"
        entry["response_ms"] = round((asyncio.get_event_loop().time() - t0) * 1000)

        # Probe metrics
        try:
            mr = await client.get(f"{base}/metrics")
            mr.raise_for_status()
            prom = parse_prometheus(mr.text)
            entry["metrics"] = _extract_metrics(prom, runtime)
        except Exception:
            pass

    except Exception:
        pass

    # Detect activity via gen_tokens_total delta
    server_key = f"{host}:{port}"
    if entry["metrics"]:
        current = entry["metrics"].get("gen_tokens_total", 0) or 0
        prev = _prev_gen_tokens.get(server_key, 0)
        had_activity = current > prev and prev > 0
        _prev_gen_tokens[server_key] = current
        requests_running = entry["metrics"].get("requests_running", 0)
        entry["active"] = requests_running > 0 or had_activity

    # Probe Glances for GPU stats
    glances_host = server.get("glances_host")
    if glances_host:
        entry["glances"] = await _probe_glances(client, glances_host, server.get("glances_gpu_index", 0))

    return entry


def _extract_metrics(prom: dict[str, float], runtime: str) -> dict:
    if runtime == "llama.cpp":
        return {
            "gen_tokens_per_sec": prom.get("llamacpp:predicted_tokens_seconds"),
            "prompt_tokens_per_sec": prom.get("llamacpp:prompt_tokens_seconds"),
            "requests_running": int(prom.get("llamacpp:requests_processing", 0)),
            "prompt_tokens_total": int(prom.get("llamacpp:prompt_tokens_total", 0)),
            "gen_tokens_total": int(prom.get("llamacpp:tokens_predicted_total", 0)),
        }
    elif runtime == "vLLM":
        # Derive gen t/s from inter_token_latency histogram
        itl_count = prom.get("vllm:inter_token_latency_seconds_count", 0)
        itl_sum = prom.get("vllm:inter_token_latency_seconds_sum", 0)
        gen_tps = round(itl_count / itl_sum, 1) if itl_sum > 0 else None
        # Derive prompt t/s from prompt_tokens_total / time_to_first_token_seconds_sum
        prompt_total = prom.get("vllm:prompt_tokens_total", 0)
        ttft_sum = prom.get("vllm:time_to_first_token_seconds_sum", 0)
        prompt_tps = round(prompt_total / ttft_sum, 1) if ttft_sum > 0 else None
        return {
            "gen_tokens_per_sec": gen_tps,
            "prompt_tokens_per_sec": prompt_tps,
            "requests_running": int(prom.get("vllm:num_requests_running", 0)),
            "requests_waiting": int(prom.get("vllm:num_requests_waiting", 0)),
            "prompt_tokens_total": int(prom.get("vllm:prompt_tokens_total", 0)),
            "gen_tokens_total": int(prom.get("vllm:generation_tokens_total", 0)),
            "cache_hits_total": int(prom.get("vllm:prompt_tokens_cached_total", 0)),
        }
    return {}


# ── Glances probe ─────────────────────────────────

async def _probe_glances(client: httpx.AsyncClient, host: str, gpu_index: int) -> dict | None:
    result: dict = {}
    try:
        # Quick-look for CPU/RAM
        ql = await client.get(f"http://{host}:{GLANCES_PORT}/api/4/quicklook")
        ql.raise_for_status()
        ql_data = ql.json()
        result["cpu_percent"] = ql_data.get("cpu")
        result["ram_percent"] = ql_data.get("mem")
    except Exception:
        return None

    try:
        # GPU stats
        gr = await client.get(f"http://{host}:{GLANCES_PORT}/api/4/gpu")
        gr.raise_for_status()
        gpus = gr.json()
        if isinstance(gpus, list) and gpu_index < len(gpus):
            gpu = gpus[gpu_index]
            result["gpu"] = {
                "name": gpu.get("name"),
                "proc": gpu.get("proc"),
                "mem": gpu.get("mem"),
                "temp": gpu.get("temperature"),
                "fan": gpu.get("fan_speed"),
            }
    except Exception:
        pass

    return result


# ── Service probes ────────────────────────────────

async def _probe_service(client: httpx.AsyncClient, service: dict) -> dict:
    entry = {"name": service["name"], "status": "down", "response_ms": None}

    # TCP-only check (e.g. Voice Server using Wyoming protocol)
    if "host" in service and "port" in service and "url" not in service:
        try:
            loop = asyncio.get_event_loop()
            t0 = loop.time()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(PROBE_TIMEOUT)
            await loop.run_in_executor(None, sock.connect, (service["host"], service["port"]))
            sock.close()
            entry["status"] = "ok"
            entry["response_ms"] = round((loop.time() - t0) * 1000)
        except Exception:
            pass
        return entry

    # HTTP check
    try:
        t0 = asyncio.get_event_loop().time()
        r = await client.get(service["url"], headers=service.get("headers"))
        r.raise_for_status()
        entry["status"] = "ok"
        entry["response_ms"] = round((asyncio.get_event_loop().time() - t0) * 1000)
    except Exception:
        pass
    return entry


# ── Gateway info ──────────────────────────────────

AGENTS_DIR = _AGENTS_DIR


def _get_main_session_info() -> dict | None:
    """Read main agent's session state from the gateway's sessions.json."""
    sessions_file = AGENTS_DIR / "main" / "sessions" / "sessions.json"
    if not sessions_file.is_file():
        return None

    try:
        with sessions_file.open() as f:
            data = _json.load(f)
    except Exception:
        return None

    main = data.get("agent:main:main")
    if not main:
        return None

    model_provider = main.get("modelProvider", "")
    model_id = main.get("model", "")
    model = f"{model_provider}/{model_id}" if model_provider else model_id

    context_tokens = main.get("totalTokens", 0)
    context_max = main.get("contextTokens", 200000)
    compactions = main.get("compactionCount", 0)

    return {
        "key": f"agent:main:{main.get('sessionId', 'main')}",
        "model": model or None,
        "context_tokens": context_tokens,
        "context_max": context_max,
        "context_percent": round(context_tokens / context_max * 100) if context_max else 0,
        "compactions": compactions,
    }


def _get_gateway_info() -> dict:
    """Get OpenClaw gateway process info via psutil."""
    info: dict = {"status": "down", "uptime_seconds": None, "memory_mb": None, "version": None, "pid": None, "session": None}

    # Find openclaw-gateway process (shows as "node" in psutil, but cmdline[0] is "openclaw-gateway")
    for proc in psutil.process_iter(["pid", "name", "create_time", "memory_info", "cmdline"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            if cmdline and "openclaw-gateway" in cmdline[0]:
                info["status"] = "ok"
                info["pid"] = proc.info["pid"]
                info["uptime_seconds"] = int(datetime.now(timezone.utc).timestamp() - proc.info["create_time"])
                mem = proc.info["memory_info"]
                if mem:
                    info["memory_mb"] = round(mem.rss / (1024 * 1024), 1)
                break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    # Get version
    try:
        result = subprocess.run(["openclaw", "--version"], capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            info["version"] = result.stdout.strip()
    except Exception:
        pass

    # Get main session context info
    try:
        info["session"] = _get_main_session_info()
    except Exception:
        pass

    return info


# ── Agent activity detection ──────────────────────

def _get_agent_activity() -> dict[str, dict]:
    """Check which agents are currently active by session file mtime,
    and read the current model provider from sessions.json.

    Returns dict of agent_id -> {"active": bool, "last_active": float, "session_id": str, "current_provider": str|None}
    """
    result: dict[str, dict] = {}
    now = time.time()

    if not AGENTS_DIR.is_dir():
        return result

    for agent_dir in AGENTS_DIR.iterdir():
        if not agent_dir.is_dir():
            continue
        agent_id = agent_dir.name
        sessions_dir = agent_dir / "sessions"
        if not sessions_dir.is_dir():
            continue

        # Check activity via JSONL file mtime
        jsonl_files = list(sessions_dir.glob("*.jsonl"))
        if not jsonl_files:
            continue

        latest = max(jsonl_files, key=lambda p: p.stat().st_mtime)
        mtime = latest.stat().st_mtime
        age = now - mtime

        # Read current provider from sessions.json
        current_provider = None
        sessions_file = sessions_dir / "sessions.json"
        if sessions_file.is_file():
            try:
                with sessions_file.open() as f:
                    sdata = _json.load(f)
                main_session = sdata.get(f"agent:{agent_id}:main")
                if main_session:
                    current_provider = main_session.get("modelProvider")
            except Exception:
                pass

        result[agent_id] = {
            "active": age < 30,
            "last_active": mtime,
            "session_id": latest.stem,
            "current_provider": current_provider,
        }

    return result


# ── Agent + Cron data ─────────────────────────────

async def _get_agents_data(client: httpx.AsyncClient) -> dict:
    """Fetch agent data from internal API, enriched with live activity state."""
    activity = _get_agent_activity()

    try:
        r = await client.get("http://127.0.0.1:8088/api/agents")
        r.raise_for_status()
        agents_raw = r.json()
    except Exception:
        return {"total": 0, "active": 0, "idle": 0, "error": 0, "agents": []}

    agents = []
    counts = {"active": 0, "idle": 0, "error": 0}
    for a in agents_raw:
        agent_id = a.get("id") if isinstance(a, dict) else None
        act = activity.get(agent_id, {}) if agent_id else {}
        status = "active" if act.get("active") else "idle"
        last_active = act.get("last_active")
        last_seen_at = (
            datetime.fromtimestamp(last_active, tz=timezone.utc).isoformat()
            if last_active
            else None
        )

        if status in counts:
            counts[status] += 1
        agents.append({
            "id": agent_id,
            "name": a.get("name"),
            "emoji": a.get("emoji"),
            "status": status,
            "model": a.get("model"),
            "current_provider": act.get("current_provider"),
            "last_seen_at": last_seen_at,
        })

    return {
        "total": len(agents),
        **counts,
        "agents": agents,
        "_any_active": any(act.get("active") for act in activity.values()),
    }


async def _get_cron_data(client: httpx.AsyncClient) -> dict:
    """Fetch schedule data from internal API."""
    try:
        r = await client.get("http://127.0.0.1:8088/api/schedules")
        r.raise_for_status()
        schedules = r.json()
    except Exception:
        return {"total": 0, "ok": 0, "late": 0, "error": 0, "schedules": []}

    counts = {"ok": 0, "late": 0, "error": 0}
    for s in schedules:
        st = s.get("status", "ok")
        if st in counts:
            counts[st] += 1

    return {
        "total": len(schedules),
        **counts,
        "schedules": schedules,
    }


# ── Main endpoint ────────────────────────────────

@router.get("/status", summary="Live infrastructure status")
async def status() -> dict:
    """Probe all LLM servers, services, gateway, agents, and cron in parallel."""
    async with httpx.AsyncClient(timeout=PROBE_TIMEOUT) as client:
        # Run all probes concurrently
        llm_tasks = [_probe_llm_server(client, s) for s in LLM_SERVERS]
        svc_tasks = [_probe_service(client, s) for s in SERVICES]

        llm_results, svc_results, agents_data, cron_data = await asyncio.gather(
            asyncio.gather(*llm_tasks),
            asyncio.gather(*svc_tasks),
            _get_agents_data(client),
            _get_cron_data(client),
        )

    # Gateway runs on this machine — use psutil (sync, fast)
    gateway = _get_gateway_info()
    gateway["active"] = agents_data.pop("_any_active", False)

    return {
        "ts": datetime.now(timezone.utc).isoformat(),
        "gateway": gateway,
        "llm_servers": list(llm_results),
        "services": list(svc_results),
        "agents": agents_data,
        "cron": cron_data,
    }
