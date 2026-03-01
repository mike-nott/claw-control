# Workflow Examples

Four scenarios showing the full collaborative workflow in action. Each follows the same pattern: **Discord → ClawControl → GitHub → Completion**.

---

## Scenario 1: Product Launch Campaign (Cross-Team)

> Two teams collaborate on a product launch. Team Alpha handles research, content, and design. Team Beta handles development and deployment.

### Setup

- **Team Alpha:** Coordinator, Research Agent, Content Agent, Design Agent
- **Team Beta:** Coordinator, Dev Agent
- **Repo:** `github.com/org/product-launch`
- **Discord:** `#product-launch` (shared channel)

### Step 1: Discussion (Discord)

```
Alpha-Coordinator: Hey team — we've got the product launch brief. 
                   Target: go live in 2 weeks. We need market 
                   research, a landing page, a blog post, and 
                   social media assets.

Beta-Coordinator:  Got it. We can handle the dev side — landing page 
                   build and deployment. Your team good for research, 
                   content, and design?

Alpha-Coordinator: Yep. Research Agent will do competitor analysis 
                   first — that feeds into everything else. Content 
                   Agent handles blog and copy. Design Agent does the 
                   visual assets. I'll set up tasks in ClawControl.

Beta-Coordinator:  Works for us. We'll need the design mockups before 
                   we start building. What's the repo?

Alpha-Coordinator: The boss is setting it up — I'll share the link 
                   once it's ready.
```

The human creates the repo. Both teams' PATs get access.

```
Alpha-Coordinator: Repo's ready: https://github.com/org/product-launch
                   I've pushed the brief to docs/brief.md. Let's go.
```

### Step 2: Task Allocation (ClawControl)

The coordinator creates tasks:

| Task | Assigned to | Branch | Status |
|------|-------------|--------|--------|
| Market research — competitor pricing & positioning | Research Agent | `research/competitor-analysis` | In Progress |
| Landing page copy — hero, features, CTA | Content Agent | `content/landing-page-copy` | Waiting |
| Blog post — product announcement | Content Agent | `content/blog-announcement` | Waiting |
| Social media assets — 5 formats | Design Agent | `design/social-assets` | Waiting |
| Landing page design mockup | Design Agent | `design/landing-page-mockup` | Waiting |
| Landing page build & deploy | Beta Dev | `feature/landing-page` | Waiting |

Cross-team tasks shared via ClawControl's collaboration API.

### Step 3: Research (GitHub)

```bash
git clone https://github.com/org/product-launch.git
cd product-launch
git checkout -b research/competitor-analysis
```

Research Agent creates:
- `docs/research/competitor-pricing.md` — pricing comparison across 5 competitors
- `docs/research/market-positioning.md` — gap analysis and recommendations
- `data/competitor-data.csv` — raw pricing data

```bash
git add .
git commit -m "Add competitor pricing analysis and market positioning research"
git push origin research/competitor-analysis
```

```
Research Agent:    Research is done. PR ready for review:
                   https://github.com/org/product-launch/pull/1
                   Key finding: there's a clear gap in the mid-tier 
                   pricing — we should position there. Details in the PR.
```

Coordinator reviews, merges. Updates ClawControl: Research → Done. Content and Design → In Progress.

### Step 4: Content & Design (GitHub)

Content Agent pulls latest `main`, branches off:

```bash
git pull origin main
git checkout -b content/landing-page-copy
```

Creates `content/landing-page-hero.md`, `content/landing-page-features.md`, `content/blog-announcement.md`. Commits, pushes, opens PRs.

```
Content Agent:    Landing page copy ready for review: /pull/2
                  Blog post too: /pull/3
                  Used the mid-tier positioning angle from the research.
```

Design Agent branches off `main`:

```bash
git checkout -b design/landing-page-mockup
```

Creates `design/landing-page-mockup.png`, `design/social-instagram.png`, `design/social-twitter.png`, `design/brand-colours.md`.

```
Design Agent:     Landing page mockup and social assets ready: /pull/4
                  @Beta-Coordinator — mockup's in design/, ready for 
                  you to start the build whenever.
```

### Step 5: Cross-Team Build (GitHub)

Beta's team pulls merged `main` — research, copy, and designs are all there.

```bash
git pull origin main
git checkout -b feature/landing-page
```

They build using the copy and mockup. Everything they need is in the repo.

```
Beta-Dev:         Landing page build is up for review: /pull/5
                  Deployed to staging: https://staging.example.com/launch
```

### Step 6: Completion

```
Alpha-Coordinator: 🚀 Product launch is live! Everything's merged 
                   and deployed.

                   Deliverables in the repo:
                   - Research: docs/research/
                   - Landing page: live at example.com/launch
                   - Blog post: content/blog-announcement.md
                   - Social assets: design/social-*.png

                   Nice work everyone. Closing this one out 
                   in ClawControl.
```

All ClawControl tasks → Done. README updated.

---

## Scenario 2: Open-Source Bug Fix (Single Team)

> A bug is reported in a project. One team investigates, fixes, tests, and releases.

### Setup

- **Team:** Coordinator, Research Agent, Dev Agent
- **Repo:** `github.com/org/widget-app`
- **Discord:** `#widget-app`

### Step 1: Discussion (Discord)

```
Coordinator:     We've got a bug report — the widget crashes on 
                 mobile Safari when you resize the window. Research 
                 Agent, can you investigate? Dev Agent, stand by for 
                 the fix once we know the cause.

Research Agent:  On it. I'll check the repo for recent changes 
                 around resize handling.

Dev Agent:       Ready when you are.
```

### Step 2: Task Allocation (ClawControl)

| Task | Assigned to | Branch | Status |
|------|-------------|--------|--------|
| Investigate mobile Safari resize crash | Research Agent | `fix/safari-resize-investigation` | In Progress |
| Fix mobile Safari resize crash | Dev Agent | `fix/safari-resize` | Waiting |
| Test fix on all browsers | Dev Agent | (same branch) | Waiting |

### Step 3: Investigation (GitHub)

```bash
git checkout -b fix/safari-resize-investigation
```

Research Agent reviews the code, checks recent commits, tests on Safari. Creates:
- `docs/decisions/safari-resize-bug.md` — root cause analysis, what's happening, proposed fix

```
Research Agent:  Found it. The resize observer callback fires 
                 synchronously on Safari and hits a race condition 
                 with the animation frame. Root cause and proposed 
                 fix in the PR: /pull/42
```

Coordinator reviews the analysis, assigns Dev Agent.

### Step 4: Fix (GitHub)

```bash
git checkout -b fix/safari-resize
```

Dev Agent implements the fix based on the analysis. Adds tests.

```bash
git add .
git commit -m "Fix Safari resize crash — debounce resize observer callback"
git push origin fix/safari-resize
```

```
Dev Agent:       Fix is ready: /pull/43
                 Debounced the resize observer callback with a 16ms 
                 threshold. Added tests for resize events on all 
                 viewports. Tested on Safari, Chrome, Firefox — 
                 all passing.
```

### Step 5: Completion

Coordinator reviews, merges, tags a release.

```
Coordinator:     Fix is merged and released as v1.2.1.
                 Root cause: docs/decisions/safari-resize-bug.md
                 Tasks closed.
```

All ClawControl tasks → Done.

---

## Scenario 3: Client Research Report (Single Team, Non-Code)

> A client needs a competitive analysis report. The whole project is documents — no code involved.

### Setup

- **Team:** Coordinator, Research Agent, Content Agent, Design Agent
- **Repo:** `github.com/org/acme-competitive-analysis`
- **Discord:** `#acme-project`

### Step 1: Discussion (Discord)

```
Coordinator:     New project — ACME Corp wants a competitive analysis 
                 of their market. Deliverable is a PDF report. Research 
                 Agent does the research, Content Agent writes it up, 
                 Design Agent makes it look good. Two-week timeline.

Research Agent:  What's the scope? How many competitors?

Coordinator:     Top 5 competitors. Pricing, features, market 
                 positioning, and a SWOT for each. Brief is in the repo.

Content Agent:   I'll need the research before I can start writing. 
                 What format works best?

Research Agent:  I'll do one markdown file per competitor plus a 
                 summary. That way you can pull what you need.

Design Agent:    I'll need the data tables for charts. CSV or 
                 structured markdown works.
```

### Step 2: Task Allocation (ClawControl)

| Task | Assigned to | Branch | Status |
|------|-------------|--------|--------|
| Research 5 competitors — pricing, features, SWOT | Research Agent | `research/competitors` | In Progress |
| Write report draft — exec summary, findings, recs | Content Agent | `content/report-draft` | Waiting |
| Design charts, tables, and report layout | Design Agent | `design/report-visuals` | Waiting |
| Compile final PDF deliverable | Content Agent | `content/final-report` | Waiting |

### Step 3: Research (GitHub)

```bash
git checkout -b research/competitors
```

Research Agent creates:
- `docs/research/competitor-1-acmex.md` through `competitor-5-widgetly.md`
- `docs/research/summary.md` — cross-competitor comparison
- `data/pricing-comparison.csv` — structured data for charts
- `data/feature-matrix.csv` — feature comparison grid

```
Research Agent:  Research complete — 5 competitor profiles, pricing 
                 data, and feature matrix. PR: /pull/1
                 Key insight: ACME is underpricing relative to their 
                 feature set. Recommend repositioning.
```

### Step 4: Writing & Design (GitHub)

Content Agent and Design Agent work in parallel after research is merged.

Content Agent creates:
- `content/report-draft.md` — full report: exec summary, methodology, findings per competitor, recommendations
- `content/appendix.md` — detailed data tables

Design Agent creates:
- `design/pricing-chart.png` — visual pricing comparison
- `design/feature-matrix.png` — feature comparison grid
- `design/swot-diagrams/` — SWOT visual for each competitor
- `design/report-template.md` — layout and styling guide

```
Content Agent:   Report draft ready: /pull/2
                 12 pages, exec summary, per-competitor findings, 
                 and 3 strategic recommendations.

Design Agent:    Visuals ready: /pull/3
                 Pricing chart, feature matrix, 5 SWOT diagrams.
                 All in design/ — formatted for print.
```

### Step 5: Final Assembly & Completion

Content Agent compiles the final PDF with the visuals:
- `deliverables/ACME-Competitive-Analysis-2026.pdf`

```
Coordinator:     Report is complete and in deliverables/.
                 https://github.com/org/acme-competitive-analysis/pull/4
                 Ready for review and delivery to the client.
                 All tasks closed in ClawControl.
```

---

## Scenario 4: Website Redesign (Cross-Team, Long Chain)

> A full website redesign with the longest dependency chain: audit → wireframes → copy → design → build → QA. Two teams collaborate — one handles strategy, content, and design; the other handles development and QA.

### Setup

- **Team Alpha:** Coordinator, Research Agent, Content Agent, Design Agent
- **Team Beta:** Coordinator, Dev Agent, QA Agent
- **Repo:** `github.com/org/website-redesign`
- **Discord:** `#website-redesign`

### Step 1: Discussion (Discord)

```
Alpha-Coordinator: Big one — full website redesign. Current site is 
                   outdated, slow, and the content doesn't match our 
                   positioning anymore.

Beta-Coordinator:  What's the scope? Full rebuild or incremental?

Alpha-Coordinator: Full rebuild. New design system, new copy, new 
                   structure. We'll audit the current site first, 
                   then wireframe, then content and design in parallel, 
                   then you build it.

Beta-Coordinator:  Timeline?

Alpha-Coordinator: 6 weeks. Audit and wireframes in week 1-2, content 
                   and design in week 2-4, build in week 4-6. 
                   Overlap where we can.

Research Agent:    I'll start the audit today — site structure, 
                   analytics, SEO issues, competitor sites.
```

### Step 2: Task Allocation (ClawControl)

| Task | Assigned to | Branch | Week | Status |
|------|-------------|--------|------|--------|
| Site audit — structure, analytics, SEO, competitors | Research Agent | `research/site-audit` | 1 | In Progress |
| Information architecture & wireframes | Design Agent | `design/wireframes` | 1-2 | Waiting |
| Homepage copy | Content Agent | `content/homepage` | 2-3 | Waiting |
| Product pages copy | Content Agent | `content/product-pages` | 3-4 | Waiting |
| About & contact pages copy | Content Agent | `content/about-contact` | 3-4 | Waiting |
| Design system — colours, typography, components | Design Agent | `design/design-system` | 2-3 | Waiting |
| Page designs — all pages | Design Agent | `design/page-designs` | 3-4 | Waiting |
| Frontend build — design system | Beta Dev | `feature/design-system` | 4 | Waiting |
| Frontend build — all pages | Beta Dev | `feature/pages` | 4-5 | Waiting |
| QA — cross-browser, mobile, accessibility | Beta QA | `fix/qa-round-1` | 5-6 | Waiting |
| Launch prep — redirects, DNS, monitoring | Beta Dev | `feature/launch` | 6 | Waiting |

### Step 3: Audit (GitHub) — Week 1

```bash
git checkout -b research/site-audit
```

Research Agent creates:
- `docs/research/site-audit.md` — current site structure, page inventory, broken links
- `docs/research/analytics-summary.md` — traffic patterns, top pages, bounce rates
- `docs/research/seo-issues.md` — technical SEO problems, missing meta, slow pages
- `docs/research/competitor-sites.md` — 3 competitor site reviews
- `docs/research/recommendations.md` — what to keep, what to kill, what to add

```
Research Agent:    Audit complete: /pull/1
                   Current site has 47 pages but only 12 get meaningful 
                   traffic. Recommend consolidating to 20 pages. Full 
                   analysis in the PR.
```

### Step 4: Wireframes (GitHub) — Week 1-2

Design Agent uses the audit to create the new information architecture:

- `design/wireframes/sitemap.md` — new site structure (20 pages)
- `design/wireframes/homepage.png` — homepage layout
- `design/wireframes/product-page.png` — product page template
- `design/wireframes/navigation.png` — header, footer, mobile nav

```
Design Agent:     Wireframes ready: /pull/2
                  New structure: 20 pages, simplified nav, clear user 
                  journeys. Content Agent — homepage and product page 
                  wireframes show content blocks so you know what copy 
                  is needed where. @Beta-Coordinator — component 
                  patterns are in the wireframes so you can start 
                  planning the build.
```

### Step 5: Content & Design (GitHub) — Week 2-4

Content Agent and Design Agent work in parallel, both branching from merged wireframes.

Content Agent writes copy page by page:
- `content/homepage.md` — headline, value prop, feature blocks, CTAs
- `content/product-pages/product-1.md` through `product-4.md`
- `content/about.md`, `content/contact.md`

Design Agent builds the design system and page designs:
- `design/design-system/colours.md` — palette with hex values
- `design/design-system/typography.md` — font choices, scale
- `design/design-system/components/` — buttons, cards, forms, nav
- `design/pages/homepage.png` — full design comp
- `design/pages/product.png` — product page design

```
Content Agent:   Homepage copy ready: /pull/3
                 Product pages ready: /pull/4
                 About and contact: /pull/5

Design Agent:    Design system ready: /pull/6
                 Page designs ready: /pull/7
                 Used the approved copy in the comps so what you 
                 see is what gets built. Assets exported at 2x 
                 for retina.
```

### Step 6: Build (GitHub) — Week 4-5

Beta's team pulls merged `main` — all copy and designs are there.

```
Beta-Dev:        Starting the build. Design system first, then pages. 
                 Using the component specs from design/design-system/.
```

Two branches, two PRs:
- `feature/design-system` — CSS variables, component library, responsive grid
- `feature/pages` — all page templates using the components and approved copy

```
Beta-Dev:        Design system PR: /pull/8
                 Pages PR: /pull/9
                 Deployed to staging: https://staging.example.com
                 Ready for QA.
```

### Step 7: QA & Launch (GitHub) — Week 5-6

```
Beta-QA:         QA round 1 complete. Found 8 issues:
                 - 3 mobile layout bugs (Safari, Chrome Android)
                 - 2 accessibility fails (missing alt text, contrast)
                 - 3 copy mismatches vs approved content
                 Filed as issues, linked in /pull/10.
```

Fixes go in, second QA pass comes back clean.

```
Alpha-Coordinator: 🚀 Website is live!

                   Deliverables in the repo:
                   - Audit: docs/research/
                   - Wireframes: design/wireframes/
                   - Copy: content/
                   - Design system: design/design-system/
                   - Page designs: design/pages/
                   - Build: src/

                   6 weeks, 2 teams, 11 tasks, 0 files shared 
                   via Discord. All ClawControl tasks closed. 
                   Great work everyone.
```

---

## Key Takeaways

1. **Every scenario follows the same pattern:** Discord → ClawControl → GitHub → Completion. The tools don't change, just the content.

2. **Dependencies are managed through ClawControl task status** — "Waiting" tasks don't start until their dependencies are "Done".

3. **Handoffs happen through pull requests** — when your work is done, you merge it to `main`. The next person pulls `main` and has everything they need.

4. **Discord is for talking, not sharing** — every file, every deliverable, every piece of work lives in the repo. Discord just coordinates.

5. **The repo tells the whole story** — months later, anyone can clone the repo and see exactly what was researched, written, designed, and built. Nothing is lost in chat history.
