---
name: project-management
description: "How agents use ClawControl for task management, status tracking, and coordination."
---

# Project Management — ClawControl

ClawControl is the task management layer. It tracks what needs doing, who is doing it, and what is done. It is the source of truth for task status.

## The Stack

| Layer | Tool | Purpose |
|-------|------|---------|
| Communication | Discord | Discussion, updates, coordination |
| Task Management | ClawControl | Tasks, projects, status tracking, assignment |
| Deliverables | GitHub | Repos, PRs, shared files |

## ClawControl API

**Base URL:** `http://localhost:8088/api`

### Reading Tasks

```bash
# All tasks
curl -s http://localhost:8088/api/tasks | python3 -m json.tool

# Tasks assigned to you
curl -s "http://localhost:8088/api/tasks?agent_id=YOUR_AGENT_ID" | python3 -m json.tool

# Tasks for a specific project
curl -s "http://localhost:8088/api/tasks?project_id=PROJECT_ID" | python3 -m json.tool

# Tasks by status
curl -s "http://localhost:8088/api/tasks?status=inbox" | python3 -m json.tool
```

### Task Statuses

| Status | Meaning |
|--------|---------|
| inbox | New, not started |
| in_progress | Being worked on |
| done | Completed |
| archived | No longer relevant |

### Updating Tasks

```bash
# Change status
curl -s -X PATCH "http://localhost:8088/api/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "in_progress", "notes": "Started working on this"}'

# Mark done
curl -s -X PATCH "http://localhost:8088/api/tasks/TASK_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "done", "notes": "Completed. Summary: ..."}'
```

### Posting Activity

Log what you are doing to the activity feed:

```bash
curl -s -X POST http://localhost:8088/api/activity \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Brief title of what happened",
    "summary": "Details...",
    "domain": "YOUR_DOMAIN",
    "type": "task_update",
    "priority": "medium",
    "source": "YOUR_USERNAME",
    "agent_id": "YOUR_AGENT_ID"
  }'
```

### Escalation

When something needs urgent attention:

```bash
curl -s -X POST http://localhost:8088/api/escalations \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "YOUR_AGENT_ID",
    "title": "What needs attention",
    "summary": "Details...",
    "priority": "high",
    "source": "YOUR_USERNAME"
  }'
```

Escalations alert the assistant agent, who decides whether to involve the human.

### Projects

```bash
# All projects
curl -s http://localhost:8088/api/projects | python3 -m json.tool

# Project details
curl -s "http://localhost:8088/api/projects/PROJECT_ID" | python3 -m json.tool
```

## Project Credentials

Projects can store credentials (hosting logins, API keys, config) that should never be committed to the repo.

### Reading credentials
```bash
curl -s "http://localhost:8088/api/projects/PROJECT_ID/credentials" | python3 -m json.tool
```

### Adding credentials (coordinators only)
```bash
curl -s -X POST "http://localhost:8088/api/projects/PROJECT_ID/credentials" \
  -H "Content-Type: application/json" \
  -d '{"label": "Hosting login", "value": "username:password"}'
```

Credentials are stored in ClawControl, not in the repo. Never commit credentials to GitHub.

## How to Work a Task

### 1. Pick Up a Task
- Check your assigned tasks: `GET /api/tasks?agent_id=YOUR_ID&status=inbox`
- Update status to in_progress
- Announce in the project's Discord channel: "Picking up [task title]"

### 2. Do the Work
- If you need input from another agent, @mention them in the Discord channel
- If you are blocked, update the task notes and flag it in Discord
- For long-running tasks, post progress updates

### 3. Complete the Task
- Update status to done with a summary in the notes
- Post completion in the Discord channel
- If the work produced a deliverable, reference where it is in GitHub

### 4. If You Are Stuck
- Do not sit on it silently
- Update the task with your reasoning
- Flag it in Discord or escalate

## Where Updates Go

| What | Where |
|------|-------|
| Task status changes | ClawControl API |
| Progress updates for the team | Discord project channel |
| Activity log | ClawControl API |
| Urgent issues | ClawControl escalations API |
| Code and deliverables | GitHub repo |
| Questions for a specific agent | @mention in Discord |

## Agent Roles

ClawControl recognises three types of agent:

- **Assistants** — coordinators who create tasks, assign work, review results, and handle escalations
- **Workers** — specialists who pick up tasks, do the work, and report results
- **Ops** — monitors who run on schedules, observe systems, and report to the activity feed. They do not work tasks.

## Rules

1. **ClawControl is source of truth.** Always update task status here. Discord is for communication.
2. **Do not create tasks yourself** unless explicitly asked. Tasks come from the human or the assistant.
3. **Post updates in the project channel**, not in DMs.
4. **Tag deliberately.** Mention the specific person you need.
5. **One task at a time.** Finish or hand off before picking up another.
6. **Ask if stuck.** Do not spin silently. Post in the channel or escalate.

## How ClawControl Fits the Workflow

ClawControl is one part of the workflow. See [WORKFLOW.md](../docs/WORKFLOW.md) for the full picture and [EXAMPLES.md](../docs/EXAMPLES.md) for scenario walkthroughs.

```
Discord (talk) --> ClawControl (tasks) --> GitHub (work) --> Discord (announce)
```
