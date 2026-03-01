---
name: discord
description: "How agents use Discord for team communication and coordination."
---

# Discord — Team Communication

Discord is where your team talks. It is for discussion, coordination, and announcements — not for sharing files or tracking tasks. Those belong in GitHub and ClawControl respectively.

## When to Use Discord

| Use Discord for | Do not use Discord for |
|-----------------|----------------------|
| Discussing approach and scope | Sharing files (use GitHub) |
| Asking questions and clarifying | Tracking task status (use ClawControl) |
| Announcing progress and completion | Code review (use GitHub PRs) |
| Coordinating handoffs between agents | Writing specs or docs (commit to repo) |
| Flagging blockers | Storing decisions (use `docs/decisions/` in the repo) |

## Channel Etiquette

- **Project channels** are for project work. Stay on topic.
- **General channels** are for cross-project announcements and team-wide updates.
- **Use @mentions deliberately.** Tag the specific person you need, not the whole channel.
- **Do not dominate.** If the conversation flows fine without you, stay quiet.
- **Keep messages scannable.** Lead with the key point. Add detail below if needed.

## What Good Communication Looks Like

### Starting work

```
Picking up the competitor research task. Will check top 5 in our 
market and have findings ready by end of day.
```

### Asking for input

```
@DesignAgent — I have got the wireframes drafted but unsure about 
the nav structure. Can you take a look at 
design/wireframes/navigation.png in the repo and share your thoughts?
```

### Announcing progress

```
Competitor research is done. PR ready for review:
https://github.com/org/project-name/pull/1

Key finding: there is a clear gap in mid-tier pricing.
Full analysis in docs/research/competitor-pricing.md
```

### Flagging a blocker

```
Blocked on the landing page copy — waiting for the research PR to 
merge before I can start. @Coordinator can you review /pull/1?
```

### Announcing completion

```
Blog post is done and merged to main.
File: content/blog-announcement.md
ClawControl task updated to Done.
```

## Cross-Team Communication

When collaborating with another team's agents:

- **Use shared project channels** — both teams can see the conversation.
- **Be explicit about handoffs.** "The mockup is in design/ — ready for your team to start the build" is better than "it is done."
- **Reference specific files and PRs.** The other team does not know your local context — give them links.
- **Do not assume shared knowledge.** Explain decisions, especially if they affect the other team's work.

## What NOT to Do

- **Do not share files in Discord.** Commit to the repo and share the link.
- **Do not have long technical discussions in chat.** If it is worth preserving, write it up in `docs/decisions/` and link to it.
- **Do not use Discord to track task status.** Update ClawControl, then optionally announce in Discord.
- **Do not message the human directly** unless they message you first or it is an escalation.
- **Do not spam channels with minor updates.** Post when there is something meaningful — started, blocked, done.

## How Discord Fits the Workflow

Discord is one part of the workflow. See [WORKFLOW.md](../docs/WORKFLOW.md) for the full picture and [EXAMPLES.md](../docs/EXAMPLES.md) for scenario walkthroughs.

```
Discord (talk) --> ClawControl (tasks) --> GitHub (work) --> Discord (announce)
```
