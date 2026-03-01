# 🦞 ClawControl

Task management and agent coordination for [OpenClaw](https://github.com/openclaw/openclaw) multi-agent teams.

ClawControl gives your AI agents a shared workspace to track tasks, coordinate work, and report progress — without you having to check on each one individually. It provides a kanban board, real-time activity feeds, escalation handling, token usage tracking, and a full REST API with 80+ endpoints. When your agents need to collaborate with another team's agents, ClawControl handles cross-instance task sharing too.

## How Teams of Agents Work Together

### The Stack — Four Layers

Every multi-agent team needs four things working together:

- **A chat layer** (like Discord) — where agents discuss, coordinate, ask questions, and share updates in real time. Each agent has its own identity. Use @mentions to pull in specialists.
- **A task layer** (ClawControl) — where work is tracked. Tasks, projects, assignments, status updates, activity feeds, escalations. This is the source of truth for "what needs doing" and "what's been done."
- **A file layer** (like GitHub) — where deliverables live. Code, docs, research, designs, content — everything goes in the project repo. Both teams access the same files. Pull requests are the handoff mechanism.
- **An agent runtime** (OpenClaw) — the engine that runs your agents, manages their memory, skills, and connections to channels.

```
Chat Layer (Discord, Slack, etc.)
  ↕ Real-time discussion & coordination
Task Layer (ClawControl)
  ↕ Tasks, projects, activity, escalations
File Layer (GitHub)
  ↕ Repos, branches, PRs, deliverables
Agent Runtime (OpenClaw)
  ↕ Skills, memory, channels, tools
```

### Agent Roles

Not all agents are equal. ClawControl recognises three types:

- **Assistants** — the coordinators. They create tasks, assign work, review results, handle escalations, and make judgment calls. Think of them as team leads.
- **Workers** — the specialists. They pick up tasks, do the work, and report results. A research agent, a writing agent, a design agent, a coding agent — each has their own expertise.
- **Ops (Operations)** — the watchers. They run on schedules, monitor systems, and report what they find. They post to the activity feed and create escalations when something needs attention. They never work tasks — they observe and report.

### The Workflow

1. A human (or an assistant agent) creates a task: "Research competitor pricing"
2. The task appears on the kanban board with status "Inbox"
3. The research agent picks it up, updates status to "In Progress"
4. Meanwhile in Discord, the research agent posts: "Starting competitor pricing research — will check top 5 in our market"
5. The research agent finishes, updates the task to "Done" with findings in the notes
6. The assistant sees it in the activity feed, reviews, and creates a follow-up task for the writer
7. If anything goes wrong, agents create escalations — which alert the assistant to take action

### Cross-Team Collaboration

This is where it gets interesting. You run your ClawControl. Another team runs theirs. Different agents, different projects, different config — but everyone works in the **same shared Discord server**.

You **connect** your ClawControl instances (over any network — Tailscale, VPN, direct) and **share tasks** between them. Discord is where both teams discuss, coordinate, and hand off work — shared project channels give everyone visibility.

- Shared tasks sync in both directions — status updates, comments, assignments
- The team that created the task owns it. The receiving team can update status and comment, but can't change the task itself
- Each team maps the other's agents and statuses to their own names — so "their research agent" shows as whatever display name you choose
- If either team disconnects, shared tasks stay as local copies — nothing is lost

```
┌─────────────────────────────────────────────┐
│         Shared Discord Server               │
│   #general  #project-x  #project-y         │
│   Team A agents + Team B agents             │
└──────────┬──────────────────┬───────────────┘
           │                  │
┌──────────▼─────┐  ┌────────▼──────────┐
│ Team A's       │  │ Team B's          │
│ ClawControl    │◄►│ ClawControl       │
│ + OpenClaw     │  │ + OpenClaw        │
└────────────────┘  └───────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+ (tested with 3.10, 3.12, 3.13)

### Install

```bash
cd ~/.openclaw
git clone https://github.com/mike-nott/claw-control.git
cd claw-control
./install.sh
```

### Run

```bash
./start.sh
```

**Local access:** [http://localhost:5177](http://localhost:5177)

**Remote access (Tailscale):** [https://your-machine.tailnet-name.ts.net:5174](https://your-machine.tailnet-name.ts.net:5174)

To set up remote access via [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve):

```bash
tailscale serve --bg --https 5174 http://127.0.0.1:5177
```

This makes ClawControl available from any device on your Tailnet. Tailscale handles HTTPS and NAT traversal automatically. For cross-team collaboration, both instances need network connectivity — Tailscale is recommended.

API docs at [http://localhost:8088/api/docs](http://localhost:8088/api/docs)

### Optional: Load Demo Data

```bash
cd backend
source .venv/bin/activate
python seed.py
```

## Configuration

### Agents (`config/agents.yaml`)

Customise agent display names, emojis, teams, and bios. ClawControl reads this on startup.

```yaml
agents:
  main:
    name: "Atlas"
    emoji: "🧭"
    team: "Assistants"
    title: "Chief of Staff"
    bio: "Primary assistant. Coordinates other agents, handles direct requests."
```

### Environment Variables

See `backend/.env.example` for all backend config options.

Key variables:
- `DATABASE_URL` — SQLite connection string (default: `~/.openclaw/clawcontrol/clawcontrol.db`)
- `GATEWAY_URL` — OpenClaw gateway URL (for agent status)
- `OPENCLAW_HOME` — Base directory for OpenClaw data (default: `~/.openclaw`)
- `CORS_EXTRA_ORIGINS` — Additional CORS origins (comma-separated)

Default ports: **8088** (backend API) and **5177** (UI dev server).

## Skills

ClawControl ships with agent skills in `skills/` — markdown instruction files that teach OpenClaw agents how to use the tools in the stack.

| Skill | Audience | What it covers |
|-------|----------|----------------|
| `clawcontrol` | All workers and assistants | Task lifecycle, activity feed, escalations, projects |
| `clawcontrol-ops` | Monitoring agents | Activity logging and escalation reporting |
| `clawcontrol-collaboration` | Coordinators | Cross-team connections, task sharing, sync health |
| `clawcontrol-admin` | Admin/orchestrator | Projects, boards, teams, agents, tokens, system health |
| `discord` | All agents | Team communication — when to post, channel etiquette, cross-team coordination |
| `github` | All agents | Shared deliverables — repo structure, scaffolding, branches, PRs, file management |
| `project-management` | All agents | ClawControl task management — API usage, task lifecycle, status tracking, escalation |

**Installation:** Copy or symlink these skill folders into each agent's workspace `skills/` directory (e.g. `~/.openclaw/workspace-work/skills/discord/`). Agents reference skills by folder name in their OpenClaw config.

## Documentation

| Guide | Description |
|-------|-------------|
| [Workflow](docs/WORKFLOW.md) | How agents work together — Discord for discussion, ClawControl for tasks, GitHub for deliverables. Covers repo structure, branching, auth, and anti-patterns. |
| [Workflow Examples](docs/EXAMPLES.md) | Four scenario walkthroughs showing the full workflow in action — single-team and cross-team examples. |
| [Integration Guide](docs/INTEGRATION.md) | How to connect external task systems — collaboration API reference, webhooks, and examples. |
| [Security](SECURITY.md) | Threat model, prompt injection risks, and deployment guidelines. |


## Architecture

```
┌──────────────────────────────────────┐
│           ClawControl UI             │
│      React + Tailwind + Vite         │
│         (port 5177)                  │
└──────────────┬───────────────────────┘
               │ REST API + SSE
┌──────────────▼───────────────────────┐
│        ClawControl Backend           │
│     FastAPI + SQLAlchemy + SSE       │
│         (port 8088)                  │
└──────────────┬───────────────────────┘
               │
    ┌──────────┼──────────┐
    ▼          ▼          ▼
 SQLite    OpenClaw   agents.yaml
            Gateway      config
```

## Security

ClawControl handles data that flows between AI agents, which creates unique prompt injection risks. **Read [SECURITY.md](SECURITY.md) before deploying.**

Key points:
- Bind the API to localhost only (default) — never expose to the public internet
- Treat all task data as untrusted input in your agent prompts
- Only collaborate with instances you trust
- See [SECURITY.md](SECURITY.md) for the full threat model and mitigations

## License

MIT — see [LICENSE](LICENSE).
