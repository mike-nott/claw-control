# ClawControl Integration Analysis

Analysis of the existing collaboration API, task mutation points, and event infrastructure — used to inform the webhook system design.

## 1. Collaboration (Federation) API

All federation endpoints are in `backend/app/routes/federation.py`, with task sharing endpoints in `backend/app/routes/tasks.py`.

### Connection Management (Local)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/federation/connections` | GET | List all federation connections |
| `/api/federation/connections/{id}` | GET | Get single connection details |
| `/api/federation/connections/{id}` | PATCH | Update connection (name, agent_map, status_map) |
| `/api/federation/connections/{id}` | DELETE | Disconnect from remote instance |
| `/api/federation/status` | GET | Health-check all active connections |

### Connection Handshake

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/federation/invite` | POST | Initiate federation invite to remote | None (local) |
| `/api/federation/remote/invite` | POST | Receive invite from remote | Bearer token |
| `/api/federation/remote/disconnect` | POST | Remote disconnect notification | Bearer token |
| `/api/federation/remote/ping` | GET | Health check from remote | Bearer token |

### Task Sharing

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/tasks/{task_id}/share` | POST | Share task with a connected instance |
| `/api/tasks/{task_id}/share/{connection_id}` | DELETE | Unshare task from a connection |
| `/api/tasks/{task_id}/federation` | GET | Get federation metadata for a task |

### Remote Task Sync (Inbound)

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/api/federation/remote/tasks/inbound` | POST | Receive shared task from remote | Bearer token |
| `/api/federation/remote/tasks/{id}/update` | PATCH | Receive task update from remote | Bearer token |
| `/api/federation/remote/tasks/{id}/comment` | POST | Receive comment from remote | Bearer token |
| `/api/federation/remote/tasks/{id}/unshare` | POST | Remote unsharing a task | Bearer token |

### Sync Queue

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/federation/queue` | GET | List sync queue events |
| `/api/federation/queue/process` | POST | Manually trigger queue processing |
| `/api/federation/queue/clear` | DELETE | Clear delivered/expired events |

### How Connections Work

Bidirectional token exchange: when instance A invites instance B, both generate Bearer tokens. Each instance stores `token_ours` (for the remote to authenticate with us) and `token_theirs` (for us to authenticate with the remote). Connection states: `active`, `paused`, `broken`.

### How Tasks Are Shared

1. Local instance calls `POST /api/tasks/{id}/share` with a `connection_id`
2. Task is sent to remote's `/api/federation/remote/tasks/inbound`
3. Both instances create `federation_task_links` — the originator with `direction=outbound`, the receiver with `direction=inbound`
4. Originator can send full task data. Receiver can only send status/assignee changes
5. Agent and status values are mapped using `agent_map` and `status_map` on the connection

### Sync Queue

Failed outbound syncs are queued in `federation_sync_queue`. A background loop runs every 60 seconds to retry pending events (max 10 attempts, 7-day expiry). After 3+ failed attempts on all pending events for a connection, the connection is automatically marked `broken`.

## 2. Task Mutation Points

Every place in the code where tasks or projects are created, updated, or deleted.

### Task Mutations — `app/routes/tasks.py`

| Function | Line | HTTP | Event Published |
|----------|------|------|-----------------|
| `create_task()` | 117 | POST `/api/tasks` | `task.created` |
| `patch_task()` | 208 | PATCH `/api/tasks/{id}` | `task.updated` + federation sync |
| `delete_task()` | 314 | DELETE `/api/tasks/{id}` | `task.deleted` |
| `bulk_delete_tasks()` | 325 | DELETE `/api/tasks` | (no event published) |

### Project Mutations — `app/routes/projects.py`

| Function | Line | HTTP | Event Published |
|----------|------|------|-----------------|
| `create_project()` | 165 | POST `/api/projects` | `project.created` |
| `patch_project()` | 244 | PATCH `/api/projects/{id}` | `project.updated` |
| `delete_project()` | 313 | DELETE `/api/projects/{id}` | `project.deleted` |
| `create_board()` | 362 | POST `/api/projects/{id}/boards` | `board.created` |
| `patch_board()` | 422 | PATCH `/api/boards/{id}` | `board.updated` |
| `delete_board()` | 473 | DELETE `/api/boards/{id}` | `board.deleted` |

### Comment Mutations — `app/routes/comments.py`

| Function | Line | HTTP | Event Published |
|----------|------|------|-----------------|
| `create_comment()` | 41 | POST `/api/tasks/{id}/comments` | `comment.created` + federation sync |
| `create_comment_with_attachment()` | 76 | POST `/api/tasks/{id}/comments/upload` | `comment.created` |

### Federation Inbound Mutations — `app/routes/federation.py`

| Function | Line | HTTP | Effect |
|----------|------|------|--------|
| `receive_inbound_task()` | 473 | POST `/remote/tasks/inbound` | Creates local task copy |
| `receive_task_update()` | 549 | PATCH `/remote/tasks/{id}/update` | Updates local task |
| `receive_task_comment()` | 626 | POST `/remote/tasks/{id}/comment` | Creates local comment |
| `receive_unshare()` | 666 | POST `/remote/tasks/{id}/unshare` | Removes federation link |

## 3. Existing Event Infrastructure

### In-Memory Event Broker — `app/events.py`

An async pub/sub system with `EventBroker` class:
- `publish(event_type, payload)` — sends to all subscribers
- `subscribe()` — returns an async queue (max 100 events per subscriber)
- Thread-safe with `asyncio.Lock`
- No persistence — events only live in subscriber queues during connection

### SSE Stream — `app/routes/stream.py`

`GET /api/stream` with optional filters (`domain`, `assignee`, `task_id`, `types`). 15-second keepalive pings. All CRUD operations publish events to the broker, which forwards them to connected SSE clients.

**Event types published:**
- `task.created`, `task.updated`, `task.deleted`
- `comment.created`
- `project.created`, `project.updated`, `project.deleted`
- `board.created`, `board.updated`, `board.deleted`
- `team.created`, `team.updated`, `team.deleted`
- `member.created`, `member.updated`, `member.deleted`
- `activity.created`, `activity_log.created`
- `agent.liveness`

### Federation Sync — `app/federation_sync.py`

Outbound HTTP pushes after task/comment mutations on shared tasks. Uses `httpx` with Bearer token auth. Failed syncs queue to `federation_sync_queue` for retry.

### Activities / Audit

Two tables: `activities` (task-level lifecycle) and `activity_log` (system-wide feed). Both populated by route handlers and published as SSE events.

### No Webhook Infrastructure

There is no existing webhook table, no configurable outbound HTTP destinations, and no webhook signature mechanism. The federation sync is the only outbound HTTP system, and it's hardcoded to specific federation endpoints.

## 4. What Needs Building

| Component | Status | Notes |
|-----------|--------|-------|
| Event broker | Exists | Already publishes all relevant events |
| SSE streaming | Exists | Real-time event delivery to UI |
| Federation sync | Exists | Outbound push for shared tasks only |
| Webhooks table | **Needs building** | Configurable destinations with event filtering |
| Webhook CRUD API | **Needs building** | Register, list, update, delete webhooks |
| Webhook dispatcher | **Needs building** | Subscribe to event broker, fire HTTP POSTs |
| HMAC signatures | **Needs building** | `X-ClawControl-Signature` header |
| `task.status_changed` event | **Needs building** | Specific event for status transitions |

### Design Decision

The event broker already publishes all mutation events. The webhook dispatcher will subscribe to the broker as a persistent background listener (same pattern as SSE, but outbound). This avoids modifying every route file — the hooks are already in place.
