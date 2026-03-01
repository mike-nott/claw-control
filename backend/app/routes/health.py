from __future__ import annotations

from datetime import datetime, timezone
from time import monotonic

from fastapi import APIRouter
from fastapi.responses import PlainTextResponse

from app.events import broker


router = APIRouter(prefix="/api", tags=["health"])
_STARTED = monotonic()


@router.get("/health", summary="Health check")
async def health() -> dict[str, str]:
    """Returns OK status and current timestamp. Use for liveness checks."""
    return {"status": "ok", "ts": datetime.now(timezone.utc).isoformat()}


@router.get("/metrics", response_class=PlainTextResponse, summary="Prometheus metrics")
async def metrics() -> str:
    """Return Prometheus-compatible metrics (uptime, SSE subscriber count)."""
    uptime_seconds = int(monotonic() - _STARTED)
    lines = [
        "clawcontrol_backend_up 1",
        f"clawcontrol_backend_uptime_seconds {uptime_seconds}",
        f"clawcontrol_sse_subscribers {broker.subscriber_count}",
    ]
    return "\n".join(lines) + "\n"
