from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.events import EventFilter, broker


router = APIRouter(prefix="/api", tags=["stream"])

SSE_KEEPALIVE_SECONDS = 15.0


def _parse_types(types: str | None) -> set[str] | None:
    """Parse comma-separated event types into a set."""
    if not types:
        return None
    parsed = {item.strip() for item in types.split(",") if item.strip()}
    return parsed or None


def _format_sse(event: str, payload: dict) -> str:
    """Format an SSE message with event type and JSON data."""
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


@router.get("/stream", summary="SSE event stream")
async def stream(
    domain: str | None = None,
    assignee: str | None = None,
    task_id: str | None = None,
    types: str | None = Query(default=None, description="Comma-separated event types"),
) -> StreamingResponse:
    """Server-Sent Events stream for real-time updates. Filter by domain, assignee, task_id, or comma-separated event types. Sends keepalive every 15 seconds."""
    event_filter = EventFilter(
        types=_parse_types(types),
        domain=domain,
        assignee=assignee,
        task_id=task_id,
    )

    async def event_generator():
        async with broker.subscribe() as queue:
            yield _format_sse("keepalive", {"ts": datetime.now(timezone.utc).isoformat()})
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE_SECONDS)
                except asyncio.TimeoutError:
                    yield _format_sse("keepalive", {"ts": datetime.now(timezone.utc).isoformat()})
                    continue

                if not event_filter.matches(message):
                    continue

                yield _format_sse(
                    message.event_type,
                    {
                        "type": message.event_type,
                        "ts": message.ts.isoformat(),
                        "payload": message.payload,
                    },
                )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
