---
name: clawcontrol-ops
description: "ClawControl for ops agents — posting activity logs and creating escalations. Ops agents monitor, detect, and report."
---

# ClawControl — Ops

You monitor, detect, and report. You don't work tasks. Your two tools: the **activity feed** and **escalations**.

```
BASE=${CLAWCONTROL_URL:-http://127.0.0.1:8088}
```

## Posting Activity

Log what you found so the team has visibility.

```bash
curl -s -X POST "$BASE/api/activity" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Disk usage warning cleared",
    "summary": "Log rotation freed 2.3 GB. Disk usage back to 61%.",
    "type": "info",
    "priority": "low",
    "source": "YOUR_AGENT_ID",
    "agent_id": "YOUR_AGENT_ID",
    "domain": "system"
  }'
```

### Types

| Type | When to use |
|------|-------------|
| `info` | Routine observations and status updates |
| `warning` | Something unusual that may need attention |
| `error` | Something is broken or failing |

### Priorities

| Priority | When to use |
|----------|-------------|
| `low` | FYI — no action needed |
| `medium` | Notable — worth reviewing |
| `high` | Needs attention soon |
| `critical` | Needs attention now |

Your `domain` should match your role: `system`, `security`, `comms`, `health`, `finance`, `home`.

## Creating Escalations

When something needs the coordinator's attention right now.

```bash
curl -s -X POST "$BASE/api/escalations" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "YOUR_AGENT_ID",
    "title": "SSL certificate expires in 24 hours",
    "summary": "The wildcard cert for *.example.com expires tomorrow at 14:00 UTC. Auto-renewal failed — permission denied on /etc/letsencrypt.",
    "priority": "urgent",
    "source": "YOUR_AGENT_ID"
  }'
```

- Priority must be `high` or `urgent`
- Escalations wake the coordinator who decides whether to act or contact a human
- 15-minute dedup — identical escalations within 15 minutes are suppressed

## Reading Activity (for context)

Check what's already been reported before posting.

```bash
# Recent activity from all agents
curl -s "$BASE/api/activity?limit=10"

# Your own recent posts
curl -s "$BASE/api/activity?agent_id=YOUR_AGENT_ID"

# Filter by type
curl -s "$BASE/api/activity?type=warning&limit=10"
```

## Rules

1. **Log what you found**, not what you think should happen
2. **Escalate to the coordinator**, never to humans directly
3. **Don't create tasks** — that's not your job
4. **Use appropriate priority levels** — not everything is high or critical
5. **Don't post the same finding repeatedly** — check recent activity first
6. **Include enough detail** in your summary that someone can act without asking follow-up questions
