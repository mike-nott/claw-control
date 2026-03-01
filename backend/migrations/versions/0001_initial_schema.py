"""Complete ClawControl schema (SQLite).

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-02-28
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── agents ──────────────────────────────────────
    op.create_table(
        "agents",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("emoji", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "kind IN ('openclaw_agent','script','local_llm','human')",
            name="ck_agents_kind",
        ),
        sa.CheckConstraint(
            "status IN ('idle','active','offline','error')",
            name="ck_agents_status",
        ),
    )
    op.create_index("idx_agents_status", "agents", ["status"])
    op.create_index("idx_agents_last_seen_at", "agents", ["last_seen_at"])

    # ── teams ───────────────────────────────────────
    op.create_table(
        "teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("mm_team_id", sa.Text(), nullable=True),
        sa.Column("icon", sa.Text(), nullable=True),
        sa.Column("is_local", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )

    # ── projects ────────────────────────────────────
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column("owner", sa.Text(), nullable=True),
        sa.Column("mm_team_id", sa.Text(), nullable=True),
        sa.Column("mm_category_id", sa.Text(), nullable=True),
        sa.Column("github_repo", sa.Text(), nullable=True),
        sa.Column("discord_channel", sa.Text(), nullable=True),
        sa.Column("discord_server", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "status IN ('active','paused','completed','archived')",
            name="ck_projects_status",
        ),
    )
    op.create_index("idx_projects_status", "projects", ["status"])

    # ── project_teams (multi-team support) ──────────
    op.create_table(
        "project_teams",
        sa.Column("project_id", sa.Text(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("team_id", sa.Text(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
        sa.PrimaryKeyConstraint("project_id", "team_id"),
    )

    # ── boards ──────────────────────────────────────
    op.create_table(
        "boards",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("mm_channel_id", sa.Text(), nullable=True),
        sa.Column("mm_board_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("idx_boards_project_id", "boards", ["project_id"])

    # ── tasks ───────────────────────────────────────
    op.create_table(
        "tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("domain", sa.Text(), nullable=False, server_default=sa.text("'general'")),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("priority", sa.Text(), nullable=False),
        sa.Column(
            "assignee_agent_id",
            sa.Text(),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("worker_kind", sa.Text(), nullable=False),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("source_event_ids_json", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.Text(), nullable=False),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("claimed_by", sa.Text(), nullable=True),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("claim_token", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "board_id",
            sa.String(36),
            sa.ForeignKey("boards.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "reviewer_agent_id",
            sa.Text(),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("mm_card_id", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "status IN ('inbox','in_progress','review','done')",
            name="ck_tasks_status",
        ),
        sa.CheckConstraint(
            "priority IN ('low','medium','high','urgent')",
            name="ck_tasks_priority",
        ),
    )
    op.create_index("idx_tasks_status", "tasks", ["status"])
    op.create_index("idx_tasks_assignee_status", "tasks", ["assignee_agent_id", "status"])
    op.create_index("idx_tasks_priority_status", "tasks", ["priority", "status"])
    op.create_index("idx_tasks_created_at_desc", "tasks", [sa.text("created_at DESC")])
    op.create_index("idx_tasks_project_id", "tasks", ["project_id"])
    op.create_index("idx_tasks_board_id", "tasks", ["board_id"])
    op.create_index("idx_tasks_reviewer_agent_id", "tasks", ["reviewer_agent_id"])

    # ── task_event_links ────────────────────────────
    op.create_table(
        "task_event_links",
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("event_store", sa.Text(), nullable=False),
        sa.Column("event_id", sa.Text(), nullable=False),
        sa.Column(
            "linked_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.PrimaryKeyConstraint("task_id", "event_store", "event_id"),
    )
    op.create_index(
        "idx_task_event_links_event",
        "task_event_links",
        ["domain", "event_store", "event_id"],
    )

    # ── comments ────────────────────────────────────
    op.create_table(
        "comments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("author_type", sa.Text(), nullable=False),
        sa.Column("author_id", sa.Text(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("attachment_json", sa.JSON(), nullable=True),
        sa.Column("mm_post_id", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "author_type IN ('agent','human','system')",
            name="ck_comments_author_type",
        ),
    )
    op.create_index("idx_comments_task_created", "comments", ["task_id", "created_at"])
    op.create_index("idx_comments_mm_post_id", "comments", ["mm_post_id"])

    # ── activities ──────────────────────────────────
    op.create_table(
        "activities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "agent_id",
            sa.Text(),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("activity_type", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "detail_json",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("idx_activities_created_desc", "activities", [sa.text("created_at DESC")])
    op.create_index("idx_activities_task_created", "activities", ["task_id", "created_at"])
    op.create_index("idx_activities_agent_created", "activities", ["agent_id", "created_at"])

    # ── activity_log ────────────────────────────────
    op.create_table(
        "activity_log",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column(
            "priority",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'low'"),
        ),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column(
            "agent_id",
            sa.Text(),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("idx_activity_log_created_desc", "activity_log", [sa.text("created_at DESC")])
    op.create_index("idx_activity_log_type", "activity_log", ["type", sa.text("created_at DESC")])
    op.create_index("idx_activity_log_source", "activity_log", ["source", sa.text("created_at DESC")])
    op.create_index("idx_activity_log_priority", "activity_log", ["priority", sa.text("created_at DESC")])
    op.create_index("idx_activity_log_agent", "activity_log", ["agent_id", sa.text("created_at DESC")])

    # ── notifications ───────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "channel",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'dashboard'"),
        ),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'suppressed'"),
        ),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "severity IN ('info','warning','critical')",
            name="ck_notifications_severity",
        ),
        sa.CheckConstraint(
            "status IN ('queued','sent','failed','suppressed')",
            name="ck_notifications_status",
        ),
    )
    op.create_index("idx_notifications_status_created", "notifications", ["status", "created_at"])

    # ── subscriptions ───────────────────────────────
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("subscriber_type", sa.Text(), nullable=False),
        sa.Column("subscriber_id", sa.Text(), nullable=False),
        sa.Column("filter_json", sa.JSON(), nullable=False),
        sa.Column("channel", sa.Text(), nullable=False),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "subscriber_type IN ('human','agent','system')",
            name="ck_subscriptions_subscriber_type",
        ),
    )
    op.create_index("idx_subscriptions_enabled", "subscriptions", ["enabled"])

    # ── escalations ─────────────────────────────────
    op.create_table(
        "escalations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "agent_id",
            sa.Text(),
            sa.ForeignKey("agents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column(
            "priority",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'urgent'"),
        ),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column(
            "payload",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_by", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "priority IN ('high', 'urgent')",
            name="ck_escalations_priority",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'acknowledged', 'resolved')",
            name="ck_escalations_status",
        ),
    )
    op.create_index("idx_escalations_status", "escalations", ["status"])
    op.create_index("idx_escalations_agent_id", "escalations", ["agent_id"])
    op.create_index("idx_escalations_created_at", "escalations", [sa.text("created_at DESC")])

    # ── task_attachments ────────────────────────────
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("stored_filename", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column(
            "uploaded_by",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'user'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
    )
    op.create_index("idx_task_attachments_task", "task_attachments", ["task_id"])

    # ── team_members ────────────────────────────────
    op.create_table(
        "team_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "team_id",
            sa.String(36),
            sa.ForeignKey("teams.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("agent_id", sa.Text(), nullable=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("mm_username", sa.Text(), nullable=True),
        sa.Column("mm_user_id", sa.Text(), nullable=True),
        sa.Column("role", sa.Text(), nullable=True),
        sa.Column("bio", sa.Text(), nullable=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("model_tier", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.Column("avatar_url", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.CheckConstraint(
            "type IN ('agent','human','external_agent','external_human')",
            name="ck_team_members_type",
        ),
        sa.CheckConstraint(
            "status IN ('active','inactive','away')",
            name="ck_team_members_status",
        ),
    )
    op.create_index("idx_team_members_team_id", "team_members", ["team_id"])
    op.create_index("idx_team_members_agent_id", "team_members", ["agent_id"])
    op.create_index(
        "idx_team_members_mm_username",
        "team_members",
        ["mm_username"],
        unique=True,
    )

    # ── project_credentials ─────────────────────────
    op.create_table(
        "project_credentials",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "project_id",
            sa.Text(),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.Text(),
            nullable=False,
            server_default=sa.text("(datetime('now'))"),
        ),
        sa.Column(
            "updated_at",
            sa.Text(),
            nullable=False,
            server_default=sa.text("(datetime('now'))"),
        ),
    )
    op.create_index(
        "idx_project_credentials_project_id",
        "project_credentials",
        ["project_id"],
    )

    # ── federation_connections ──────────────────────
    op.create_table(
        "federation_connections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("instance_id", sa.String(36), nullable=False, unique=True),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("token_theirs", sa.Text(), nullable=False),
        sa.Column("token_ours", sa.Text(), nullable=False),
        sa.Column(
            "agent_map",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "status_map",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("last_sync_at", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'active'"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'paused', 'broken')",
            name="ck_federation_connections_status",
        ),
    )

    # ── federation_task_links ──────────────────────
    op.create_table(
        "federation_task_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "local_task_id",
            sa.String(36),
            sa.ForeignKey("tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("remote_task_id", sa.Text(), nullable=False),
        sa.Column(
            "connection_id",
            sa.String(36),
            sa.ForeignKey("federation_connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("direction", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("last_synced_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("local_task_id", "connection_id", name="uq_federation_task_links_task_conn"),
        sa.CheckConstraint(
            "direction IN ('outbound', 'inbound')",
            name="ck_federation_task_links_direction",
        ),
    )
    op.create_index("idx_federation_task_links_connection_id", "federation_task_links", ["connection_id"])

    # ── federation_sync_queue ──────────────────────
    op.create_table(
        "federation_sync_queue",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "connection_id",
            sa.String(36),
            sa.ForeignKey("federation_connections.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'delivered', 'failed', 'expired')",
            name="ck_federation_sync_queue_status",
        ),
    )
    op.create_index("idx_federation_sync_queue_status_created", "federation_sync_queue", ["status", "created_at"])
    op.create_index("idx_federation_sync_queue_connection_id", "federation_sync_queue", ["connection_id"])

    # ── webhooks ────────────────────────────────────
    op.create_table(
        "webhooks",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("events", sa.Text(), nullable=False),
        sa.Column("secret", sa.Text(), nullable=True),
        sa.Column("active", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.Text(), nullable=False, server_default=sa.text("(datetime('now'))")),
    )


def downgrade() -> None:
    op.drop_table("webhooks")
    op.drop_table("federation_sync_queue")
    op.drop_table("federation_task_links")
    op.drop_table("federation_connections")
    op.drop_table("project_credentials")
    op.drop_table("team_members")
    op.drop_table("task_attachments")
    op.drop_table("escalations")
    op.drop_table("subscriptions")
    op.drop_table("notifications")
    op.drop_table("activity_log")
    op.drop_table("activities")
    op.drop_table("comments")
    op.drop_table("task_event_links")
    op.drop_table("tasks")
    op.drop_table("boards")
    op.drop_table("project_teams")
    op.drop_table("projects")
    op.drop_table("teams")
    op.drop_table("agents")
