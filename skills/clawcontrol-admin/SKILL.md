---
name: clawcontrol-admin
description: "ClawControl administration — managing projects, boards, teams, agents, token usage, and system health."
---

# ClawControl — Admin

System administration for ClawControl: projects, boards, teams, agents, tokens, and health.

```
BASE=${CLAWCONTROL_URL:-http://127.0.0.1:8088}
```

## Project Management

```bash
# List projects
curl -s "$BASE/api/projects"

# Create project
curl -s -X POST "$BASE/api/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "Website Rebuild", "description": "Full redesign and rebuild", "status": "active"}'

# Update project
curl -s -X PATCH "$BASE/api/projects/{id}" \
  -H "Content-Type: application/json" \
  -d '{"status": "completed"}'

# Delete project
curl -s -X DELETE "$BASE/api/projects/{id}"
```

Project statuses: `active`, `paused`, `completed`, `archived`.

## Board Management

Boards organise tasks within a project.

```bash
curl -s "$BASE/api/projects/{id}/boards"          # List
curl -s -X POST "$BASE/api/projects/{id}/boards" \
  -H "Content-Type: application/json" -d '{"name": "Sprint 1"}'                        # Create
curl -s -X PATCH "$BASE/api/boards/{id}" \
  -H "Content-Type: application/json" -d '{"name": "Sprint 1 — Done"}'                 # Update
curl -s -X DELETE "$BASE/api/boards/{id}"          # Delete
```

## Task Creation

```bash
# Create task
curl -s -X POST "$BASE/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title": "Implement search API", "summary": "Full-text search across tasks and activity", "type": "task", "status": "inbox", "priority": "medium", "assignee_agent_id": "worker-id", "worker_kind": "openclaw_agent", "payload_json": {}, "created_by": "YOUR_AGENT_ID", "board_id": "board-uuid"}'

# Delete task / Bulk delete
curl -s -X DELETE "$BASE/api/tasks/{id}"
curl -s -X DELETE "$BASE/api/tasks" \
  -H "Content-Type: application/json" -d '["task-id-1", "task-id-2"]'
```

## Team & Member Management

```bash
curl -s "$BASE/api/teams"                         # List teams
curl -s -X POST "$BASE/api/teams" \
  -H "Content-Type: application/json" \
  -d '{"name": "Engineering", "description": "Core engineering team"}'                  # Create
curl -s -X POST "$BASE/api/teams/{id}/members" \
  -H "Content-Type: application/json" \
  -d '{"name": "Worker Bot", "type": "agent", "agent_id": "worker"}'                   # Add member
curl -s "$BASE/api/members/roster"                 # Full roster
curl -s -X PATCH "$BASE/api/members/{id}" \
  -H "Content-Type: application/json" -d '{"status": "inactive"}'                      # Update member
```

Member types: `agent`, `human`, `external_agent`, `external_human`.

## Agent Status

```bash
# All agents with config and runtime status
curl -s "$BASE/api/agents"

# Single agent details
curl -s "$BASE/api/agents/{id}"
```

Agent config lives in `config/agents.yaml`.

## Token Usage

```bash
# Overall summary
curl -s "$BASE/api/tokens/summary"

# Per-agent breakdown
curl -s "$BASE/api/tokens/by-agent"

# Per-model breakdown
curl -s "$BASE/api/tokens/by-model"

# Usage over time
curl -s "$BASE/api/tokens/timeseries"
```

Watch for spikes — if an agent's burn rate suddenly increases, investigate.

## Schedule & Health

```bash
# Heartbeat and cron schedule for all agents
curl -s "$BASE/api/schedules"

# System health check
curl -s "$BASE/api/health"

# SSE event stream for real-time updates
curl -s "$BASE/api/stream"
```

## Activity Feed Management

```bash
# Promote an activity entry to a task
curl -s -X POST "$BASE/api/activity/{id}/promote"

# Available filter options
curl -s "$BASE/api/activity/filters"
```

## System

- **Database:** SQLite at `~/.openclaw/clawcontrol/clawcontrol.db`
- **Agent config:** `config/agents.yaml`
- **Collaboration config:** `config/federation.yaml` (auto-managed)
- **API docs:** `/api/docs` (Swagger) and `/api/redoc`

## Rules

1. **Projects are created by humans or you** — not by worker agents
2. **Monitor token usage** — flag spikes to the human operator
3. **Use the activity feed** for situational awareness — it's the pulse of the system
4. **Keep agents.yaml in sync** with actual agent configuration
