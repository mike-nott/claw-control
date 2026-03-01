---
name: clawcontrol
description: "ClawControl task management — reading tasks, updating status, posting activity, escalating issues, working with projects and boards."
---

# ClawControl

Task management and coordination for your agent team. You interact via REST API.

```
BASE=${CLAWCONTROL_URL:-http://127.0.0.1:8088}
```

## Your Task Lifecycle

1. **Check assignments:** `GET /api/tasks?assignee=YOUR_AGENT_ID&status=inbox`
2. **Pick up a task:** `PATCH /api/tasks/{id}` with `{"status": "in_progress"}`
3. **Do the work**
4. **Complete:** `PATCH /api/tasks/{id}` with `{"status": "done"}`
5. **Comment what you did:** `POST /api/tasks/{id}/comments`

## Reading Tasks

```bash
# All tasks
curl -s "$BASE/api/tasks"

# Filter by status: inbox, in_progress, review, done
curl -s "$BASE/api/tasks?status=inbox"

# Your assignments
curl -s "$BASE/api/tasks?assignee=YOUR_AGENT_ID"

# Filter by board
curl -s "$BASE/api/tasks?board_id=BOARD_ID"

# Single task
curl -s "$BASE/api/tasks/{id}"

# Task comments
curl -s "$BASE/api/tasks/{id}/comments"
```

## Updating Tasks

```bash
curl -s -X PATCH "$BASE/api/tasks/{id}" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "summary": "Completed — deployed v2 with new rate limits."}'
```

Updatable fields: `status`, `priority`, `summary`, `title`, `assignee_agent_id`, `project_id`, `board_id`, `reviewer_agent_id`.

### Task Statuses

| Status | Meaning |
|--------|---------|
| `inbox` | New, not yet started |
| `in_progress` | Actively being worked on |
| `review` | Done, awaiting review |
| `done` | Completed |

## Adding Comments

```bash
curl -s -X POST "$BASE/api/tasks/{id}/comments" \
  -H "Content-Type: application/json" \
  -d '{"author_type": "agent", "author_id": "YOUR_AGENT_ID", "body": "Finished phase 1. Moving to integration tests."}'
```

Use comments for progress updates, questions, and handoff notes.

## Posting Activity

Log what you're doing so the team has visibility.

```bash
curl -s -X POST "$BASE/api/activity" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Deployed rate limiter",
    "summary": "Added 100 req/min limit to /api/search. No errors in first 5 min.",
    "type": "task_update",
    "priority": "low",
    "source": "YOUR_AGENT_ID",
    "agent_id": "YOUR_AGENT_ID"
  }'
```

- **Types:** `task_update`, `info`, `warning`, `error`
- **Priorities:** `low`, `medium`, `high`, `critical`

## Escalations

When something needs urgent attention from the coordinator.

```bash
curl -s -X POST "$BASE/api/escalations" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "YOUR_AGENT_ID",
    "title": "Database connection pool exhausted",
    "summary": "All 20 connections in use. Queries are queuing. Needs immediate attention.",
    "priority": "urgent",
    "source": "YOUR_AGENT_ID"
  }'
```

- Priority must be `high` or `urgent`
- Escalations wake the coordinator who decides next steps
- 15-minute dedup — don't post the same escalation repeatedly

## Reading Projects & Boards

```bash
# List projects
curl -s "$BASE/api/projects"

# Boards in a project
curl -s "$BASE/api/projects/{id}/boards"

# Single board
curl -s "$BASE/api/boards/{id}"
```

## Rules

1. **ClawControl is the source of truth** for task status — always update it
2. **Don't create tasks** unless explicitly asked — tasks come from humans or coordinators
3. **One task at a time** — finish or hand off before picking up another
4. **Write meaningful updates** when changing status — explain what changed and why
5. **Ask if stuck** — don't spin silently. Post a comment or escalate.
6. **Log significant work** to the activity feed so the team has visibility
