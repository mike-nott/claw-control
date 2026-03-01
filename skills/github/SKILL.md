---
name: github
description: "How agents use GitHub for sharing work and collaborating on deliverables."
---

# GitHub — Shared Work

GitHub is where deliverables live. Every project has its own repo. All work products — code, docs, research, designs, content — go in the repo so both teams can access them.

## Key Rules

- **You do not create repos.** Your human does. You receive a repo URL and work within it.
- **Always use branches.** Never commit directly to main. Create a branch, do your work, open a PR.
- **Everything goes in the repo.** If it is a deliverable, it belongs here.
- **GitHub is for finished work.** Do not commit rough notes or scratch files. Use your local workspace for drafts.

## Authentication

Your team uses a GitHub Personal Access Token (PAT). It is already configured — just use git commands normally. If auth fails, escalate to your coordinator.

## Scaffolding a New Repo

When your human creates a new repo and assigns you to set it up, read the project brief first. The folder structure should match what the project actually needs.

### Step 1: Evaluate the brief

Ask yourself:
- Is this a code project, a research project, a content project, or a mix?
- Will there be design assets?
- Will there be data files or analysis?
- Are multiple teams collaborating?

### Step 2: Choose a layout

Pick the layout that best fits, then adjust. You do not need every folder — only create what the project will use.

**Research / Analysis Project**
```
docs/
  brief.md
  research/
  decisions/
data/
deliverables/
```

**Content / Marketing Project**
```
docs/
  brief.md
  research/
content/
design/
deliverables/
```

**Website / App Build**
```
docs/
  brief.md
  research/
  decisions/
src/
content/
design/
  wireframes/
  design-system/
  pages/
deliverables/
```

**Full Mixed Project** (research + content + design + code)
```
docs/
  brief.md
  research/
  decisions/
src/
content/
design/
data/
deliverables/
```

### Step 3: Create the README

Every repo needs a README.md at the root. Use this template:

```markdown
# Project Name

Brief description of the project and its goals.

## Status

Current status (e.g. "Research phase", "In development", "Launched").

## Team

| Role | Agent/Person |
|------|-------------|
| Coordinator | ... |
| Research | ... |
| Content | ... |
| Design | ... |
| Dev | ... |

## Structure

Brief explanation of where things live in this repo.

## Links

- ClawControl project: [link]
- Discord channel: #channel-name
- Staging/production URLs (if applicable)
```

### Step 4: Commit and push

```bash
git clone https://github.com/org/project-name.git
cd project-name

# Create the structure
mkdir -p docs/research docs/decisions
# ... create other folders as needed

# Add the brief
cp /path/to/brief.md docs/brief.md

# Add the README
# ... write README.md

# Add .gitkeep to empty folders so git tracks them
find . -type d -empty -not -path './.git/*' -exec touch {}/.gitkeep \;

git add .
git commit -m "Initial project structure and brief"
git push origin main
```

Announce in Discord: "Repo is scaffolded and ready. Brief is in docs/brief.md."

## Repo Structure Reference

The full set of folders available:

```
project-name/
  README.md              # Project overview, goals, current status
  docs/                  # Documentation, specs, briefs
    brief.md             # Original project brief
    research/            # Research findings and analysis
    decisions/           # Decision records (why we chose X)
  src/                   # Source code (if applicable)
  content/               # Written content, copy, drafts
  design/                # Design files, mockups, assets
  data/                  # Data files, exports, analysis
  deliverables/          # Final outputs ready for handoff
```

Not every folder is needed for every project. The principle: someone from the other team should be able to find what they need without asking.

## Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature/task | feature/short-description | feature/landing-page |
| Research | research/topic | research/competitor-pricing |
| Content | content/piece-name | content/blog-launch-post |
| Design | design/asset-name | design/hero-banner |
| Fix | fix/what-broke | fix/broken-links |

## Working on a Task

```bash
# Clone the repo (first time only)
git clone https://github.com/org/project-name.git
cd project-name

# Or pull latest if you already have it
git pull origin main

# Create a branch for your work
git checkout -b feature/your-task
```

Commit regularly with clear messages:

```bash
git add .
git commit -m "Add competitor pricing analysis for top 5 players"
git push origin feature/your-task
```

Good commit messages:
- "Add initial research findings for competitor pricing"
- "Draft landing page copy — hero section and features"
- "Update design mockup with revised colour palette"

Bad commit messages:
- "updates"
- "WIP"
- "stuff"

## Pull Requests

PRs are how work moves between people and teams. When your work is ready:

1. Push your branch
2. Create a PR on GitHub with a clear description
3. Announce in Discord: "PR ready for review: [link]"
4. Review comments happen on GitHub, not Discord
5. After merge, update your ClawControl task to Done

## Large Files

Git is not great for large binary files (videos, high-res images, large datasets). If a file is over 10MB:
- Consider linking to it rather than committing it
- Use Git LFS if the repo is set up for it
- Ask your coordinator for guidance

## What NOT to Do

- Do not commit secrets, tokens, or API keys. Ever.
- Do not commit personal data unless it is a public-facing deliverable.
- Do not force-push to main. If something goes wrong, ask for help.
- Do not create repos. Your human does that.
- Do not share files via Discord. Commit to the repo and share the link.

## How GitHub Fits the Workflow

GitHub is one part of the workflow. See WORKFLOW.md for the full picture and EXAMPLES.md for scenario walkthroughs.

```
Discord (talk) --> ClawControl (tasks) --> GitHub (work) --> Discord (announce)
```
