from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.logging_config import setup_logging
from app.routes import (
    activities_router,
    activity_log_router,
    agents_router,
    attachments_router,
    comments_router,
    escalations_router,
    federation_router,
    health_router,
    projects_router,
    schedules_router,
    status_router,
    stream_router,
    task_attachments_router,
    tasks_router,
    teams_router,
    tokens_router,
    webhooks_router,
)


setup_logging()

_logger = logging.getLogger(__name__)


async def _sync_queue_loop() -> None:
    """Run federation sync queue processor every 60 seconds."""
    from app.db import SessionLocal
    from app.federation_queue import cleanup_delivered_events, expire_old_events, process_sync_queue

    _logger.info("Federation sync queue loop started")
    while True:
        await asyncio.sleep(60)
        try:
            db = SessionLocal()
            try:
                result = await process_sync_queue(db)
                if result["processed"] > 0:
                    _logger.info("Sync queue cycle: %s", result)
                expire_old_events(db)
                cleanup_delivered_events(db)
            finally:
                db.close()
        except Exception:
            _logger.exception("Error in sync queue loop")


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.agent_sync import sync_agents_from_config
    from app.webhook_dispatch import webhook_dispatcher_loop

    sync_agents_from_config()

    loop_task = asyncio.create_task(_sync_queue_loop())
    webhook_task = asyncio.create_task(webhook_dispatcher_loop())
    yield
    webhook_task.cancel()
    loop_task.cancel()


tags_metadata = [
    {"name": "tasks", "description": "Task CRUD — create, read, update, delete, and filter tasks."},
    {"name": "activities", "description": "Task timeline — internal lifecycle events linked to specific tasks."},
    {"name": "activity_log", "description": "System-wide activity feed — agent actions, security events, health reports, escalations."},
    {"name": "comments", "description": "Comments on tasks."},
    {"name": "agents", "description": "Agent configuration and status from OpenClaw."},
    {"name": "escalations", "description": "Agent escalation handling — urgent issues that wake the main agent."},
    {"name": "projects", "description": "Projects and boards for organising tasks."},
    {"name": "teams", "description": "Teams and team membership."},
    {"name": "schedules", "description": "Cron jobs, launchd services, and heartbeat schedules."},
    {"name": "tokens", "description": "Token usage and cost tracking across agents and models."},
    {"name": "stream", "description": "Server-Sent Events for real-time updates."},
    {"name": "health", "description": "Health checks and Prometheus metrics."},
    {"name": "status", "description": "Live infrastructure status — LLM servers, services, gateway, agents, cron."},
    {"name": "attachments", "description": "File download for task and comment attachments."},
    {"name": "task_attachments", "description": "File upload and management for task attachments."},
    {"name": "federation", "description": "Cross-team collaboration — connect, sync, and share tasks with other ClawControl instances."},
    {"name": "webhooks", "description": "Webhook subscriptions — register URLs to receive HTTP POST notifications on task and project events."},
]

app = FastAPI(
    title="ClawControl",
    description="Task management and agent coordination for OpenClaw multi-agent teams.",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_tags=tags_metadata,
    lifespan=lifespan,
)

_extra_origins = [o.strip() for o in os.getenv("CORS_EXTRA_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        *_extra_origins,
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
    expose_headers=[],
    max_age=600,
)

app.include_router(health_router)
app.include_router(activity_log_router)
app.include_router(agents_router)
app.include_router(tasks_router)
app.include_router(comments_router)
app.include_router(escalations_router)
app.include_router(federation_router)
app.include_router(attachments_router)
app.include_router(task_attachments_router)
app.include_router(activities_router)
app.include_router(schedules_router)
app.include_router(status_router)
app.include_router(stream_router)
app.include_router(tokens_router)
app.include_router(projects_router)
app.include_router(teams_router)
app.include_router(webhooks_router)
