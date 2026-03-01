# Integration Guide

> How to connect external task management systems to ClawControl — via the collaboration API or webhooks.

## Overview

ClawControl provides two integration approaches:

1. **Collaboration API** — for connecting two ClawControl instances. Bidirectional task sharing with automatic sync, agent mapping, and retry queues. This is the built-in federation system.

2. **Webhooks** — for connecting any external system. Register a URL and ClawControl will POST event payloads when tasks or projects change. Your system receives events and can push updates back via the REST API.

## 1. Collaboration API Reference

The collaboration API enables two ClawControl instances to share tasks bidirectionally. Both instances maintain their own copy of shared tasks and sync changes automatically.

### Prerequisites

Both instances need network connectivity. We recommend [Tailscale](https://tailscale.com/) for NAT traversal and encrypted transport.

### Connecting Two Instances

**Step 1: Send an invitation**

Instance A invites Instance B by providing B's endpoint:

```bash
curl -X POST http://localhost:8088/api/federation/invite \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "https://instance-b.tailnet.ts.net:5174"}'
```

Response:
```json
{
  "id": "conn-uuid",
  "name": "Instance B",
  "instance_id": "instance-b-uuid",
  "endpoint": "https://instance-b.tailnet.ts.net:5174",
  "status": "active",
  "agent_map": {},
  "status_map": {},
  "created_at": "2025-01-15T10:30:00",
  "last_sync_at": null
}
```

This performs a handshake: A sends its details to B, B auto-accepts and returns its own details. Both instances exchange Bearer tokens for mutual authentication.

**Step 2: Configure agent and status mappings**

Map the remote instance's agent names and task statuses to your own:

```bash
curl -X PATCH http://localhost:8088/api/federation/connections/conn-uuid \
  -H "Content-Type: application/json" \
  -d '{
    "agent_map": {
      "their-research-agent": "my-research-agent"
    },
    "status_map": {
      "inbox": "inbox",
      "in_progress": "in_progress",
      "review": "review",
      "done": "done"
    }
  }'
```

**Step 3: Share a task**

```bash
curl -X POST http://localhost:8088/api/tasks/task-uuid/share \
  -H "Content-Type: application/json" \
  -d '{"connection_id": "conn-uuid"}'
```

Response:
```json
{
  "is_shared": true,
  "direction": "outbound",
  "connections": [
    {
      "connection_id": "conn-uuid",
      "connection_name": "Instance B",
      "remote_task_id": "remote-task-uuid",
      "last_synced_at": null
    }
  ]
}
```

### Connection Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/federation/invite` | POST | Send invitation to remote instance |
| `/api/federation/connections` | GET | List all connections |
| `/api/federation/connections/{id}` | GET | Get connection details |
| `/api/federation/connections/{id}` | PATCH | Update mappings or name |
| `/api/federation/connections/{id}` | DELETE | Disconnect |
| `/api/federation/status` | GET | Health-check all connections |

### Task Sharing Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tasks/{id}/share` | POST | Share task with a connection |
| `/api/tasks/{id}/share/{conn_id}` | DELETE | Unshare task |
| `/api/tasks/{id}/federation` | GET | Get federation metadata |

### Sync Queue Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/federation/queue` | GET | List queued sync events |
| `/api/federation/queue/process` | POST | Manually trigger sync |
| `/api/federation/queue/clear` | DELETE | Clear delivered/expired events |

### How Sync Works

- Changes to shared tasks are pushed immediately to the remote instance
- If the push fails, the event is queued in `federation_sync_queue`
- A background loop retries queued events every 60 seconds (max 10 attempts, 7-day expiry)
- After 3+ failed attempts on all pending events for a connection, the connection is automatically marked `broken`
- The originating instance can send full task data. The receiving instance can only update status and assignee

## 2. Webhook Integration

Webhooks let any external system receive real-time notifications when things change in ClawControl.

### Register a Webhook

```bash
curl -X POST http://localhost:8088/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-system.example.com/webhook",
    "events": "task.created,task.status_changed",
    "secret": "your-shared-secret"
  }'
```

Response:
```json
{
  "id": "webhook-uuid",
  "url": "https://your-system.example.com/webhook",
  "events": "task.created,task.status_changed",
  "secret": "your-shared-secret",
  "active": 1,
  "created_at": "2025-01-15T10:30:00"
}
```

### Available Events

| Event | Fires when |
|-------|-----------|
| `task.created` | A new task is created |
| `task.updated` | Any task field changes (title, priority, assignee, etc.) |
| `task.status_changed` | Task status specifically changes (inbox → in_progress, etc.) |
| `task.deleted` | A task is deleted |
| `project.created` | A new project is created |
| `project.updated` | Any project field changes |

Use `*` to subscribe to all events.

### Webhook Payload Format

Every webhook POST sends a JSON body:

```json
{
  "event": "task.created",
  "timestamp": "2025-01-15T10:30:00+00:00",
  "data": {
    "id": "task-uuid",
    "title": "Research competitor pricing",
    "summary": "Check top 5 competitors in our market",
    "type": "research",
    "status": "inbox",
    "priority": "medium",
    "assignee_agent_id": null,
    "worker_kind": "agent",
    "project_id": "project-uuid",
    "board_id": "board-uuid",
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
  }
}
```

For `task.status_changed`, the payload includes the previous status:

```json
{
  "event": "task.status_changed",
  "timestamp": "2025-01-15T11:00:00+00:00",
  "data": {
    "id": "task-uuid",
    "title": "Research competitor pricing",
    "status": "in_progress",
    ...
  },
  "previous": {
    "status": "inbox"
  }
}
```

### Signature Verification

If you set a `secret` when registering the webhook, every request includes an `X-ClawControl-Signature` header with an HMAC-SHA256 hex digest of the raw JSON body.

Verify it in your handler:

```python
import hmac
import hashlib

def verify_signature(payload_bytes: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

### Webhook Management Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/webhooks` | GET | List all webhooks |
| `/api/webhooks` | POST | Register a new webhook |
| `/api/webhooks/{id}` | PATCH | Update URL, events, secret, or active status |
| `/api/webhooks/{id}` | DELETE | Delete a webhook |

### Pause / Resume a Webhook

```bash
# Pause
curl -X PATCH http://localhost:8088/api/webhooks/webhook-uuid \
  -H "Content-Type: application/json" \
  -d '{"active": false}'

# Resume
curl -X PATCH http://localhost:8088/api/webhooks/webhook-uuid \
  -H "Content-Type: application/json" \
  -d '{"active": true}'
```

## 3. Example: Connecting a Custom Task System

Walk through connecting an external project management tool to ClawControl.

### Step 1: Register webhooks for the events you care about

```bash
curl -X POST http://localhost:8088/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-pm-tool.example.com/clawcontrol-webhook",
    "events": "task.created,task.status_changed,task.updated",
    "secret": "my-secret-key"
  }'
```

### Step 2: Handle incoming webhook payloads

Your endpoint receives POST requests with the event payload. Map ClawControl fields to your system:

| ClawControl field | Description | Your system equivalent |
|-------------------|-------------|----------------------|
| `id` | Unique task ID (UUID) | External ID / reference |
| `title` | Short task title | Task name |
| `summary` | Longer description | Task description |
| `status` | inbox, in_progress, review, done | Your status values |
| `priority` | low, medium, high, urgent | Your priority values |
| `assignee_agent_id` | Agent ID string or null | Assignee |
| `project_id` | Project UUID or null | Project/folder |
| `board_id` | Board UUID or null | Board/list |
| `created_at` | ISO 8601 timestamp | Created date |
| `updated_at` | ISO 8601 timestamp | Modified date |

### Step 3: Push updates back via the ClawControl API

When something changes in your system, update ClawControl:

```bash
# Update task status
curl -X PATCH http://localhost:8088/api/tasks/task-uuid \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'

# Update assignee
curl -X PATCH http://localhost:8088/api/tasks/task-uuid \
  -H "Content-Type: application/json" \
  -d '{"assignee_agent_id": "research-agent"}'

# Create a new task
curl -X POST http://localhost:8088/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New task from external system",
    "summary": "Created by webhook integration",
    "type": "task",
    "status": "inbox",
    "priority": "medium",
    "worker_kind": "agent",
    "payload_json": {},
    "created_by": "external-system"
  }'
```

### Step 4: Example payloads for each event type

**task.created:**
```json
{
  "event": "task.created",
  "timestamp": "2025-01-15T10:30:00+00:00",
  "data": {
    "id": "a1b2c3d4",
    "title": "Write Q1 report",
    "summary": "Compile quarterly metrics and write executive summary",
    "type": "writing",
    "status": "inbox",
    "priority": "high",
    "assignee_agent_id": "main",
    "worker_kind": "agent",
    "project_id": "proj-uuid",
    "board_id": null,
    "created_by": "user",
    "created_at": "2025-01-15T10:30:00",
    "updated_at": "2025-01-15T10:30:00"
  }
}
```

**task.status_changed:**
```json
{
  "event": "task.status_changed",
  "timestamp": "2025-01-15T11:15:00+00:00",
  "data": {
    "id": "a1b2c3d4",
    "title": "Write Q1 report",
    "status": "in_progress",
    "assignee_agent_id": "writing-agent",
    "updated_at": "2025-01-15T11:15:00"
  },
  "previous": {
    "status": "inbox"
  }
}
```

**task.updated:**
```json
{
  "event": "task.updated",
  "timestamp": "2025-01-15T11:30:00+00:00",
  "data": {
    "id": "a1b2c3d4",
    "title": "Write Q1 report",
    "priority": "urgent",
    "assignee_agent_id": "writing-agent",
    "updated_at": "2025-01-15T11:30:00"
  }
}
```

**task.deleted:**
```json
{
  "event": "task.deleted",
  "timestamp": "2025-01-15T12:00:00+00:00",
  "data": {
    "id": "a1b2c3d4",
    "title": "Write Q1 report",
    "status": "done"
  }
}
```

**project.created:**
```json
{
  "event": "project.created",
  "timestamp": "2025-01-15T09:00:00+00:00",
  "data": {
    "id": "proj-uuid",
    "name": "Q1 Planning",
    "description": "First quarter planning and execution",
    "status": "active",
    "github_repo": "team/q1-planning",
    "created_at": "2025-01-15T09:00:00"
  }
}
```

**project.updated:**
```json
{
  "event": "project.updated",
  "timestamp": "2025-01-15T14:00:00+00:00",
  "data": {
    "id": "proj-uuid",
    "name": "Q1 Planning",
    "status": "completed",
    "updated_at": "2025-01-15T14:00:00"
  }
}
```

## 4. Example: Simple Sync Script

A minimal Python script that listens for ClawControl webhooks and prints task changes. Fork and adapt to your needs.

```python
"""Minimal ClawControl webhook receiver — prints events to stdout."""

import hashlib
import hmac
import json
from http.server import HTTPServer, BaseHTTPRequestHandler

WEBHOOK_SECRET = "your-shared-secret"  # Must match the secret you registered


class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length)

        # Verify signature if secret is set
        signature = self.headers.get("X-ClawControl-Signature")
        if WEBHOOK_SECRET and signature:
            expected = hmac.new(
                WEBHOOK_SECRET.encode(), body, hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected, signature):
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b"Invalid signature")
                return

        event = json.loads(body)
        event_type = event.get("event", "unknown")
        data = event.get("data", {})

        print(f"\n--- {event_type} at {event['timestamp']} ---")
        print(f"  Task: {data.get('title', 'N/A')} ({data.get('id', '?')})")
        print(f"  Status: {data.get('status', 'N/A')}")

        if "previous" in event:
            print(f"  Previous: {event['previous']}")

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, format, *args):
        pass  # Suppress default request logging


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 9000), WebhookHandler)
    print("Listening for ClawControl webhooks on port 9000...")
    server.serve_forever()
```

Run it, then register the webhook:

```bash
python webhook_listener.py &

curl -X POST http://localhost:8088/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{
    "url": "http://localhost:9000",
    "events": "*",
    "secret": "your-shared-secret"
  }'
```

## 5. Task Field Reference

Complete reference of all task fields returned in webhook payloads and API responses.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique task identifier |
| `title` | string | Short task title |
| `summary` | string | Longer task description |
| `type` | string | Task type (e.g. "task", "research", "bug") |
| `status` | string | Current status: `inbox`, `in_progress`, `review`, `done` |
| `priority` | string | Priority: `low`, `medium`, `high`, `urgent` |
| `assignee_agent_id` | string or null | ID of the assigned agent |
| `reviewer_agent_id` | string or null | ID of the reviewing agent |
| `worker_kind` | string | Worker type (e.g. "agent", "human") |
| `project_id` | string or null | Parent project UUID |
| `board_id` | string or null | Parent board UUID |
| `due_at` | string or null | ISO 8601 due date |
| `created_by` | string | Who created the task |
| `claimed_by` | string or null | Agent that claimed the task |
| `claimed_at` | string or null | When the task was claimed |
| `payload_json` | object | Arbitrary metadata attached to the task |
| `source_event_ids_json` | object or null | Links to source events that triggered this task |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last-modified timestamp |

## 6. Project Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Unique project identifier |
| `name` | string | Project name |
| `description` | string or null | Project description |
| `status` | string | Status: `active`, `paused`, `completed`, `archived` |
| `owner` | string or null | Project owner |
| `github_repo` | string or null | GitHub repository (owner/repo format) |
| `discord_server` | string or null | Discord server name or ID |
| `discord_channel` | string or null | Discord channel name |
| `created_at` | string | ISO 8601 creation timestamp |
| `updated_at` | string | ISO 8601 last-modified timestamp |

## 7. Authentication

### Local API Access

The ClawControl API has no authentication on local endpoints. It's designed to run on localhost or behind a trusted network (Tailscale). All `GET`, `POST`, `PATCH`, `DELETE` endpoints at `/api/*` are open.

If you need to restrict access, put a reverse proxy (nginx, Caddy) in front of ClawControl with your preferred auth method.

### Webhook Secrets

Webhook secrets provide payload verification, not access control. When you register a webhook with a `secret`, every POST includes an `X-ClawControl-Signature` header — an HMAC-SHA256 hex digest of the raw JSON body using your secret as the key.

Always verify the signature in your webhook handler to ensure payloads are genuinely from your ClawControl instance.

### Federation Authentication

Federation connections use mutual Bearer token exchange. Tokens are generated during the invite handshake and stored per-connection. Remote endpoints (`/api/federation/remote/*`) require a valid `Authorization: Bearer <token>` header.
