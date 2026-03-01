from __future__ import annotations

TASK_STATUSES = {
    "inbox",
    "in_progress",
    "review",
    "done",
}

PROJECT_STATUSES = {
    "active",
    "paused",
    "completed",
    "archived",
}

MEMBER_TYPES = {"agent", "human", "external_agent", "external_human"}
MEMBER_STATUSES = {"active", "inactive", "away"}

FEDERATION_CONNECTION_STATUSES = {"active", "paused", "broken"}
FEDERATION_SYNC_STATUSES = {"pending", "delivered", "failed", "expired"}
FEDERATION_DIRECTIONS = {"outbound", "inbound"}
