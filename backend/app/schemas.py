from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class AgentHeartbeatIn(BaseModel):
    status: str = Field(default="idle")


class TaskCreateIn(BaseModel):
    title: str
    summary: str
    type: str
    status: str = Field(default="inbox")
    priority: str = Field(default="medium")
    assignee_agent_id: str | None = None
    worker_kind: str
    payload_json: dict[str, Any]
    source_event_ids_json: dict[str, Any] | None = None
    created_by: str
    due_at: datetime | None = None
    project_id: str | None = None
    board_id: str | None = None
    reviewer_agent_id: str | None = None


class TaskPatchIn(BaseModel):
    title: str | None = None
    summary: str | None = None
    type: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee_agent_id: str | None = None
    worker_kind: str | None = None
    payload_json: dict[str, Any] | None = None
    source_event_ids_json: dict[str, Any] | None = None
    created_by: str | None = None
    due_at: datetime | None = None
    project_id: str | None = None
    board_id: str | None = None
    reviewer_agent_id: str | None = None
    mm_card_id: str | None = None


class CommentCreateIn(BaseModel):
    author_type: str
    author_id: str
    body: str


class ProjectCreateIn(BaseModel):
    name: str
    description: str | None = None
    status: str = Field(default="active")
    owner: str | None = None
    github_repo: str | None = None
    discord_server: str | None = None
    discord_channel: str | None = None
    team_ids: list[str] | None = None


class ProjectPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    status: str | None = None
    owner: str | None = None
    github_repo: str | None = None
    discord_server: str | None = None
    discord_channel: str | None = None
    team_ids: list[str] | None = None


class ProjectCredentialCreateIn(BaseModel):
    label: str
    value: str


class ProjectCredentialPatchIn(BaseModel):
    label: str | None = None
    value: str | None = None


class BoardCreateIn(BaseModel):
    name: str
    description: str | None = None
    position: int = 0


class BoardPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    position: int | None = None


class ScheduleCreateIn(BaseModel):
    name: str
    interval_minutes: int
    enabled: bool = True


class ScheduleOut(BaseModel):
    id: UUID
    name: str
    interval_minutes: int
    enabled: bool
    created_at: datetime


class TeamCreateIn(BaseModel):
    name: str
    description: str | None = None
    mm_team_id: str | None = None
    icon: str | None = None
    is_local: bool = False


class TeamPatchIn(BaseModel):
    name: str | None = None
    description: str | None = None
    mm_team_id: str | None = None
    icon: str | None = None
    is_local: bool | None = None


class MemberCreateIn(BaseModel):
    name: str
    type: str
    agent_id: str | None = None
    mm_username: str | None = None
    mm_user_id: str | None = None
    role: str | None = None
    bio: str | None = None
    category: str | None = None
    model_tier: str | None = None
    status: str = Field(default="active")
    avatar_url: str | None = None


class MemberPatchIn(BaseModel):
    name: str | None = None
    type: str | None = None
    agent_id: str | None = None
    mm_username: str | None = None
    mm_user_id: str | None = None
    role: str | None = None
    bio: str | None = None
    category: str | None = None
    model_tier: str | None = None
    status: str | None = None
    avatar_url: str | None = None


# ---- Federation ----


class ConnectionInvite(BaseModel):
    """Sent TO a remote instance to propose a connection."""
    instance_id: str
    instance_name: str
    endpoint: str
    token_for_you: str


class ConnectionAcceptResponse(BaseModel):
    """Returned BY the remote instance when accepting an invite."""
    instance_id: str
    instance_name: str
    token_for_you: str
    connection_id: str


class ConnectionOut(BaseModel):
    """Public representation of a connection (no tokens exposed)."""
    id: str
    name: str
    instance_id: str
    endpoint: str
    status: str
    agent_map: dict[str, Any]
    status_map: dict[str, Any]
    created_at: datetime
    last_sync_at: datetime | None


class ConnectionUpdate(BaseModel):
    """Update agent/status mappings or name."""
    name: str | None = None
    agent_map: dict[str, Any] | None = None
    status_map: dict[str, Any] | None = None


class ConnectionStatus(BaseModel):
    """Health status for a connection."""
    id: str
    name: str
    status: str
    reachable: bool
    last_sync_at: datetime | None
    remote_instance_name: str | None = None


class InviteRequest(BaseModel):
    """Request body for initiating a federation invite."""
    endpoint: str


# ---- Federation Task Sharing ----


class TaskShareRequest(BaseModel):
    """Request to share a task with a connected instance."""
    connection_id: str
    assignee_mapping: str | None = None


class FederatedTask(BaseModel):
    """Task payload sent between instances during federation sync."""
    remote_task_id: str
    title: str
    description: str | None = None
    status: str
    priority: str | None = None
    assignee: str | None = None
    created_at: datetime
    updated_at: datetime


class FederatedTaskUpdate(BaseModel):
    """Update payload for a shared task. Receivers can only update status and assignee."""
    status: str | None = None
    assignee: str | None = None


class FederatedComment(BaseModel):
    """Comment synced between instances on a shared task."""
    remote_comment_id: str
    author: str
    content: str
    created_at: datetime


class TaskFederationInfo(BaseModel):
    """Federation metadata for a task."""
    is_shared: bool
    direction: str | None = None
    connections: list[dict[str, Any]]


# ---- Webhooks ----


class WebhookCreateIn(BaseModel):
    """Register a new webhook."""
    url: str
    events: str = Field(description="Comma-separated event types, e.g. task.created,task.updated")
    secret: str | None = None


class WebhookPatchIn(BaseModel):
    """Update webhook fields."""
    url: str | None = None
    events: str | None = None
    secret: str | None = None
    active: bool | None = None
