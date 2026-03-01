# Workflow

> How two OpenClaw teams work together on a shared project — from first conversation to final delivery.

## The Three Tools

| Tool | Purpose | What lives here |
|------|---------|-----------------|
| **Discord** | Conversation | Discussion, questions, status updates, announcements |
| **ClawControl** | Task management | Task creation, assignment, status tracking, cross-team sharing |
| **GitHub** | File storage & collaboration | All deliverables — code, docs, research, designs, content |

Each tool has a clear role. Overlap is avoided — files don't get shared via Discord, code reviews don't happen in ClawControl, task status isn't tracked in GitHub.

## Principles

- **One repo per project** — clean separation, clear ownership, easy to archive.
- **Always branch, never commit to main** — cross-team work needs review gates. Pull requests are the handoff mechanism.
- **Humans create repos** — agents work within them.
- **Everything goes in the repo** — code, docs, research, designs, content. GitHub is the shared filestore. Both teams can access everything without asking.
- **GitHub is for finished work** — don't commit rough notes or scratch files. Use your local workspace for drafts.

## Authentication

Each team gets a **fine-grained GitHub Personal Access Token (PAT)** with repo-level access:

- **Scope:** Read/write access to the team's project repos
- **Storage:** OpenClaw secrets (`openclaw secrets set GITHUB_PAT <token>`)
- **Git config:** PAT used via HTTPS credential helper or embedded in remote URL
- **Rotation:** When a PAT expires, the team's human creates a new one and updates the secret

Agents don't need individual GitHub identities. Commits go through the agent's git config, attributed to the team. For cross-team work, both teams access the same repo via their own PATs.

## Repo Structure

Every project repo follows this convention:

```
project-name/
├── README.md              # Project overview, goals, current status
├── docs/                  # Documentation, specs, briefs
│   ├── brief.md           # Original project brief
│   ├── research/          # Research findings and analysis
│   └── decisions/         # Decision records (why we chose X)
├── src/                   # Source code (if applicable)
├── content/               # Written content, copy, drafts
├── design/                # Design files, mockups, assets
├── data/                  # Data files, exports, analysis
└── deliverables/          # Final outputs ready for handoff
```

Not every folder is needed for every project. The key principle: **someone from the other team should be able to find what they need without asking.**

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature/task | `feature/short-description` | `feature/landing-page` |
| Research | `research/topic` | `research/competitor-pricing` |
| Content | `content/piece-name` | `content/blog-launch-post` |
| Design | `design/asset-name` | `design/hero-banner` |
| Fix | `fix/what-broke` | `fix/broken-links` |

## The Workflow

### 1. Discussion (Discord)

Work starts with a conversation in a shared Discord channel. Teams discuss scope, approach, and who's doing what. The coordinator summarises the plan.

**What happens on Discord:**
- Initial discussion and scoping
- Questions, clarifications, blockers
- Progress updates ("branch is ready for review")
- Completion announcements

**What does NOT happen on Discord:**
- Sharing files (use the repo)
- Detailed specs (write them in `docs/` and link to the repo)
- Code review (use GitHub PRs)

### 2. Task Allocation (ClawControl)

The coordinator creates tasks in ClawControl and assigns them to agents. For cross-team work, tasks are shared via the collaboration API so both teams see them.

Each task should reference the repo and branch:
- Task title: "Research competitor pricing"
- Task notes: "Repo: `org/project-name`, Branch: `research/competitor-pricing`"

### 3. Work (GitHub)

```bash
# Clone the repo (first time only)
git clone https://github.com/org/project-name.git
cd project-name

# Or pull latest if you already have it
git pull origin main

# Create a branch for your work
git checkout -b your-branch-name
```

Commit regularly with clear messages. Each commit should be a logical unit of work.

```bash
git add .
git commit -m "Add competitor pricing analysis for top 5 players"
git push origin your-branch-name
```

When ready, create a pull request on GitHub with a clear description of what you did and what to review. Post in Discord to let the team know.

### 4. Review and Handoff

- Pull requests are how work moves between people and teams
- Review comments happen on GitHub, not Discord
- Once approved, the branch gets merged to `main`
- After merge, update your ClawControl task status to Done

### 5. Completion

1. **GitHub** — All PRs merged to `main`. README updated with project status.
2. **ClawControl** — All tasks marked Done with a summary of what was delivered.
3. **Discord** — Announce in the project channel: what's done, where to find it.

## Where Things Happen

| Activity | Tool |
|----------|------|
| "Should we do X or Y?" | Discord |
| "Who's doing what?" | ClawControl |
| "Here's the research/copy/design" | GitHub (PR) |
| "Can you review this?" | GitHub (PR review) |
| "This is done" | Discord + ClawControl |
| "Where's the file?" | GitHub (in the repo) |

## Anti-Patterns

| Don't | Do instead |
|-------|-----------|
| Share files in Discord messages | Commit to repo, share the link |
| Write specs in Discord chat | Write in `docs/`, link to it |
| Do code review in Discord | Use GitHub PR review |
| Track task status in Discord | Update ClawControl |
| Commit directly to `main` | Branch and PR |
| Create repos yourself | Ask your human |
| Commit secrets or personal data | Never, under any circumstances |
| Wait silently when blocked | Post in Discord, update ClawControl task |

## Large Files

Git isn't great for large binary files (videos, high-res images, large datasets). If a file is over 10MB:
- Consider linking to it rather than committing it
- Use Git LFS if the repo is set up for it
- Ask your coordinator for guidance

---

For full scenario walkthroughs, see [EXAMPLES.md](EXAMPLES.md).
