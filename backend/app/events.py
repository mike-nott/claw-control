from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


@dataclass
class EventMessage:
    event_type: str
    payload: dict[str, Any]
    ts: datetime


@dataclass
class EventFilter:
    types: set[str] | None = None
    domain: str | None = None
    assignee: str | None = None
    task_id: str | None = None

    def matches(self, message: EventMessage) -> bool:
        if self.types and message.event_type not in self.types:
            return False

        payload = message.payload
        if self.domain and payload.get("domain") != self.domain:
            return False
        if self.assignee and payload.get("assignee_agent_id") != self.assignee:
            return False

        if self.task_id:
            task_id = payload.get("task_id") or payload.get("id")
            if str(task_id) != self.task_id:
                return False

        return True


class EventBroker:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[EventMessage]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        message = EventMessage(event_type=event_type, payload=payload, ts=datetime.now(timezone.utc))
        async with self._lock:
            queues = list(self._subscribers)
        for queue in queues:
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                continue

    @asynccontextmanager
    async def subscribe(self) -> AsyncIterator[asyncio.Queue[EventMessage]]:
        queue: asyncio.Queue[EventMessage] = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers.add(queue)

        try:
            yield queue
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)


broker = EventBroker()
