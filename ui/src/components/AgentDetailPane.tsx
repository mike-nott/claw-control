import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { McPill } from "./mc";
import type { AccessLevel, AgentConfig, AgentCronJob } from "../types";

interface SelectedBox {
  section: string;
  key: string;
}

interface Props {
  agent: AgentConfig | null;
  selectedBox: SelectedBox | null;
  fileCache: Record<string, { content: string | null; exists: boolean }>;
  fileLoading: boolean;
}

/* ------------------------------------------------------------------ */
/*  Tinted card styles                                                 */
/* ------------------------------------------------------------------ */

const TINT = {
  indigo: {
    bg: "rgba(99, 102, 241, 0.15)",
    border: "rgba(99, 102, 241, 0.40)",
    label: "rgba(99, 102, 241, 0.70)",
    code: "rgba(99, 102, 241, 0.20)",
  },
  blue: {
    bg: "rgba(96, 165, 250, 0.15)",
    border: "rgba(96, 165, 250, 0.40)",
    label: "rgba(96, 165, 250, 0.70)",
    code: "rgba(96, 165, 250, 0.20)",
    divider: "rgba(96, 165, 250, 0.30)",
  },
  green: {
    bg: "rgba(74, 222, 128, 0.15)",
    border: "rgba(74, 222, 128, 0.40)",
    label: "rgba(74, 222, 128, 0.70)",
  },
  cyan: {
    bg: "rgba(34, 211, 238, 0.15)",
    border: "rgba(34, 211, 238, 0.40)",
    label: "rgba(34, 211, 238, 0.70)",
    dashed: "rgba(34, 211, 238, 0.50)",
  },
  muted: {
    bg: "rgba(148, 163, 184, 0.08)",
    border: "rgba(148, 163, 184, 0.15)",
  },
  neutral: {
    bg: "var(--mc-surface-2)",
    border: "var(--mc-border)",
  },
};

type TintKey = keyof typeof TINT;

const TINT_CLASS: Record<TintKey, string> = {
  indigo: "mc-tint-indigo",
  blue: "mc-tint-blue",
  green: "mc-tint-green",
  cyan: "mc-tint-cyan",
  muted: "mc-tint-muted",
  neutral: "mc-tint-neutral",
};

/* ------------------------------------------------------------------ */
/*  Friendly names & descriptions for every resource                  */
/* ------------------------------------------------------------------ */

const MEMORY_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
  "MEMORY.md":    { name: "Memory File",   emoji: "📝", desc: "Persistent knowledge and notes" },
  "current-work": { name: "Current Work",  emoji: "🎯", desc: "Active tasks and working context" },
  "latest-comms": { name: "Latest Comms",  emoji: "💬", desc: "Recent communication summaries" },
  "people/":      { name: "People",        emoji: "👥", desc: "Contact profiles and relationships" },
  "topics/":      { name: "Topics",        emoji: "📚", desc: "Subject knowledge base" },
  "sessions/":    { name: "Sessions",      emoji: "🕐", desc: "Conversation session history" },
};

const DATA_STORE_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
  email:      { name: "Email",         emoji: "📧", desc: "Gmail and email archives" },
  slack:      { name: "Slack",         emoji: "💼", desc: "Slack workspace messages" },
  imessage:   { name: "iMessage",      emoji: "💬", desc: "Apple iMessage conversations" },
  whatsapp:   { name: "WhatsApp",      emoji: "📱", desc: "WhatsApp chat history" },
  calendar:   { name: "Calendar",      emoji: "📅", desc: "Apple Calendar events" },
  notes:      { name: "Notes",         emoji: "🗒️", desc: "Apple Notes content" },
  photos:     { name: "Photos",        emoji: "📸", desc: "Apple Photos library" },
  "health.db":{ name: "Health",        emoji: "❤️", desc: "Apple Health data" },
  contacts:   { name: "Contacts",      emoji: "📇", desc: "Address book contacts" },
  paperless:  { name: "Paperless",     emoji: "🗂️", desc: "Document management system" },
  security:   { name: "Security",      emoji: "📹", desc: "Camera and security events" },
};

const TOOL_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
  himalaya:       { name: "Himalaya",        emoji: "📧", desc: "Email CLI client" },
  gog:            { name: "Google",          emoji: "🔍", desc: "Google search and services" },
  "Apple Cal":    { name: "Apple Calendar",  emoji: "📅", desc: "Calendar management" },
  imsg:           { name: "iMessage",        emoji: "💬", desc: "Send and receive iMessages" },
  wacli:          { name: "WhatsApp CLI",    emoji: "📱", desc: "WhatsApp messaging" },
  "mem-search":   { name: "Memory Search",   emoji: "🧠", desc: "Search agent memory" },
  HA:             { name: "Home Assistant",  emoji: "🏠", desc: "Smart home control" },
  "Web Search":   { name: "Web Search",     emoji: "🌐", desc: "Internet search engine" },
  Security:       { name: "Security",        emoji: "📹", desc: "Camera and security system" },
  "MC post":      { name: "ClawControl", emoji: "📋", desc: "Post tasks and updates" },
  "WA alert":     { name: "WhatsApp Alert", emoji: "🔔", desc: "Send alert notifications" },
};

const EXTERNAL_TOOL_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
  "sag (ElevenLabs TTS)": { name: "ElevenLabs TTS",   emoji: "🎙️", desc: "Text-to-speech via sag CLI" },
  "Scrapling MCP":        { name: "Scrapling MCP",     emoji: "🕷️", desc: "Stealth web scraping with anti-bot bypass" },
  "OpenAI Image Gen":     { name: "OpenAI Image Gen",  emoji: "🎨", desc: "GPT Image 1.5 — photorealism, hero images" },
  "Nano Banana Pro":      { name: "Nano Banana Pro",   emoji: "🍌", desc: "Gemini image gen — diagrams, infographics" },
  "Ideogram API":         { name: "Ideogram",          emoji: "✏️", desc: "Text-heavy image generation" },
  "Replicate":            { name: "Replicate",         emoji: "🔄", desc: "Multi-model image generation platform" },
};

/* ------------------------------------------------------------------ */
/*  Shared components                                                 */
/* ------------------------------------------------------------------ */

function SectionHeader({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
      <span style={{ fontSize: "16px" }}>{emoji}</span>
      <span className="mc-section-label">{label}</span>
    </div>
  );
}

function SectionDesc({ children }: { children: React.ReactNode }) {
  return (
    <p className="mc-text-ghost" style={{ fontSize: "13px", marginBottom: "16px" }}>{children}</p>
  );
}

type PillVariant = "success" | "warning" | "error" | "info" | "ghost" | "primary" | "purple" | "cyan" | "orange";

function AccessBadgeLarge({ level }: { level: AccessLevel | null | undefined }) {
  if (level === null || level === undefined) {
    return <span style={{ opacity: 0.4 }}><McPill variant="ghost" size="md">No access</McPill></span>;
  }
  if (level === true) {
    return <McPill variant="primary" size="md">✓ Enabled</McPill>;
  }
  if (level === "R") {
    return <McPill variant="info" size="md">Read</McPill>;
  }
  if (level === "W") {
    return <McPill variant="orange" size="md">Write</McPill>;
  }
  if (level === "RW") {
    return <McPill variant="success" size="md">Read + Write</McPill>;
  }
  return <McPill variant="ghost" size="md">{String(level)}</McPill>;
}

function accessCardClass(level: AccessLevel | null | undefined): string {
  if (level === null || level === undefined) {
    return "mc-tint-muted";
  }
  return "mc-tint-indigo";
}

function ResourceCard({
  rawKey,
  level,
  info,
}: {
  rawKey: string;
  level: AccessLevel | null;
  info: { name: string; emoji: string; desc: string } | undefined;
}) {
  const name = info?.name ?? rawKey;
  const emoji = info?.emoji ?? "📦";
  const desc = info?.desc ?? "";

  return (
    <div
      className={accessCardClass(level)}
      style={{
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        opacity: level === null || level === undefined ? 0.4 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={{ fontSize: "20px", flexShrink: 0 }}>{emoji}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{name}</div>
            {name !== rawKey && (
              <div className="mc-text-ghost" style={{ fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>
                {rawKey}
              </div>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <AccessBadgeLarge level={level} />
        </div>
      </div>
      {desc && (
        <div className="mc-text-faint" style={{ fontSize: "12px", lineHeight: 1.5 }}>{desc}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helper: friendly description for agent tools                      */
/* ------------------------------------------------------------------ */

const AGENT_TOOL_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
  "camera-snap":       { name: "Camera Snap",       emoji: "📷", desc: "Capture snapshots from cameras" },
  "home-briefing":     { name: "Home Briefing",     emoji: "🏠", desc: "Generate home status briefings" },
  "transcribe":        { name: "Transcribe",        emoji: "🎙️", desc: "Speech-to-text transcription" },
  "memory-search":     { name: "Memory Search",     emoji: "🧠", desc: "Search agent memory stores" },
  "web-search":        { name: "Web Search",        emoji: "🌐", desc: "Search the internet" },
  "run-script":        { name: "Run Script",        emoji: "⚙️", desc: "Execute automation scripts" },
};

/* ------------------------------------------------------------------ */
/*  Model helpers                                                     */
/* ------------------------------------------------------------------ */

function splitModel(fullModel: string): { provider: string; model: string } {
  const idx = fullModel.indexOf("/");
  if (idx === -1) return { provider: "", model: fullModel };
  return { provider: fullModel.slice(0, idx), model: fullModel.slice(idx + 1) };
}

function relativeTime(isoString: string | null): string {
  if (!isoString) return "—";
  const diff = Date.now() - new Date(isoString).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);
  let label: string;
  if (mins < 1) label = "just now";
  else if (mins < 60) label = `${mins} minute${mins !== 1 ? "s" : ""}`;
  else if (hours < 24) label = `${hours} hour${hours !== 1 ? "s" : ""}`;
  else label = `${days} day${days !== 1 ? "s" : ""}`;
  return future ? `in ${label}` : `${label} ago`;
}

/* ------------------------------------------------------------------ */
/*  Shared inline style helpers                                        */
/* ------------------------------------------------------------------ */

const noAccessTextStyle: React.CSSProperties = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  fontWeight: 500,
  marginBottom: "8px",
};

/* ------------------------------------------------------------------ */
/*  Main render                                                       */
/* ------------------------------------------------------------------ */

function renderDetail(
  agent: AgentConfig,
  selectedBox: SelectedBox,
  fileCache: Record<string, { content: string | null; exists: boolean }>,
  fileLoading: boolean,
  avatarError: Record<string, boolean>,
  setAvatarError: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
): React.ReactNode {
  const { section, key } = selectedBox;

  // ── Identity — Team ─────────────────────────────────────────────
  if (section === "identity" && key === "team") {
    // Team pill colour — customise this map for your team names
    const TEAM_VARIANTS: Record<string, PillVariant> = {
      "Assistants": "primary",
      "Operations": "success",
      "Workers": "info",
    };
    const teamVariant: PillVariant = TEAM_VARIANTS[agent.team ?? ""] ?? "info";
    return (
      <div>
        <SectionHeader emoji="👤" label="Team" />
        <SectionDesc>Which division of The Crew this agent belongs to.</SectionDesc>
        <div className={TINT_CLASS.neutral}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <McPill variant={teamVariant} size="md">{agent.team}</McPill>
          </div>
        </div>
      </div>
    );
  }

  // ── Identity — Bio ──────────────────────────────────────────────
  if (section === "identity" && key === "bio") {
    return (
      <div>
        <SectionHeader emoji="📝" label="Bio" />
        <SectionDesc>Character and responsibilities summary.</SectionDesc>
        <div className={TINT_CLASS.neutral}>
          <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
            {avatarError[agent.id] ? (
              <div style={{
                width: "160px",
                height: "160px",
                borderRadius: "50%",
                flexShrink: 0,
                border: "2px solid var(--mc-border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "64px",
                background: "var(--mc-surface-2)",
              }}>
                {agent.emoji}
              </div>
            ) : (
              <img
                src={`/avatars/${agent.id}.png`}
                alt={agent.name}
                onError={() => setAvatarError(prev => ({ ...prev, [agent.id]: true }))}
                style={{
                  width: "160px",
                  height: "160px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "2px solid var(--mc-border)",
                }}
              />
            )}
            <div>
              {agent.title && (
                <div className="mc-tint-label">{agent.title}</div>
              )}
              <p className="mc-text-body" style={{ fontSize: "13px", lineHeight: 1.6, marginTop: agent.title ? "12px" : 0 }}>
                {agent.bio}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Model — Primary ────────────────────────────────────────────
  if (section === "model" && key === "primary") {
    const raw = agent.model?.primary ?? "anthropic/claude-opus-4-6";
    const { provider, model } = splitModel(raw);
    return (
      <div>
        <SectionHeader emoji="🧠" label="Primary Model" />
        <SectionDesc>The main language model this agent uses for reasoning and responses.</SectionDesc>
        <div className={TINT_CLASS.indigo}>
          {provider && (
            <div className="mc-tint-label">{provider}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "18px", fontWeight: 600 }}>{model}</span>
            {agent.default && (
              <McPill variant="primary" size="xs">default agent</McPill>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Model — Fallbacks ──────────────────────────────────────────
  if (section === "model" && key === "fallbacks") {
    const fallbacks = agent.model?.fallbacks ?? [];
    return (
      <div>
        <SectionHeader emoji="🔄" label="Fallback Chain" />
        <SectionDesc>If the primary model is unavailable, these models are tried in order.</SectionDesc>
        {fallbacks.length === 0 ? (
          <div className={`${TINT_CLASS.muted} mc-text-ghost`} style={{ fontSize: "13px" }}>
            No fallbacks configured — this agent only uses its primary model.
          </div>
        ) : (
          <div style={{ position: "relative", marginLeft: "12px" }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: "16px",
                bottom: "16px",
                borderLeft: `2px dashed ${TINT.cyan.dashed}`,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {fallbacks.map((fb, i) => {
                const { provider, model } = splitModel(fb);
                return (
                  <div key={i} style={{ position: "relative", paddingLeft: "24px" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <McPill variant="ghost" size="xs">{i + 1}</McPill>
                    </div>
                    <div className={TINT_CLASS.cyan}>
                      {provider && (
                        <div className="mc-tint-label">{provider}</div>
                      )}
                      <div style={{ fontSize: "13px", fontWeight: 600 }}>{model}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Heartbeat ───────────────────────────────────────────────
  if (section === "heartbeat") {
    const hb = agent.heartbeat;
    if (!hb) return <span className="mc-text-faint" style={{ fontSize: "13px" }}>No heartbeat configured</span>;

    return (
      <div>
        <SectionHeader emoji="💓" label="Heartbeat" />
        <SectionDesc>Periodic check-in that runs the agent's HEARTBEAT.md instructions.</SectionDesc>
        <div className={TINT_CLASS.blue} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <div className="mc-tint-label">Interval</div>
            <code className="mc-tint-code mc-rounded-input" style={{ fontSize: "13px", padding: "2px 8px" }}>
              {hb.every ?? "—"}
            </code>
          </div>
          {hb.silent != null && (
            <div>
              <div className="mc-tint-label">Silent</div>
              <span style={{ fontSize: "13px" }}>
                {hb.silent ? "Yes — HEARTBEAT_OK suppressed" : "No — responses forwarded"}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Schedule ────────────────────────────────────────────────
  if (section === "schedule") {
    const job = agent.cron_jobs.find((j: AgentCronJob) => j.id === key);
    if (!job) return <span className="mc-text-faint" style={{ fontSize: "13px" }}>Job not found</span>;

    const statusPill = (status: string | null) => {
      if (!status) return <span className="mc-text-ghost" style={{ fontSize: "13px" }}>—</span>;
      const s = status.toLowerCase();
      let variant: PillVariant = "ghost";
      if (s === "ok" || s === "success") variant = "success";
      else if (s === "error" || s === "fail" || s === "failed") variant = "error";
      else if (s === "running") variant = "info";
      return <McPill variant={variant} size="xs">{status}</McPill>;
    };

    return (
      <div>
        <SectionHeader emoji="⏰" label="Scheduled Job" />
        <SectionDesc>Automated job that runs on a cron schedule.</SectionDesc>
        <div className={TINT_CLASS.blue} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <div className="mc-tint-label">Name</div>
            <div style={{ fontSize: "16px", fontWeight: 600 }}>{job.name}</div>
          </div>
          <div>
            <div className="mc-tint-label">Schedule</div>
            <code className="mc-tint-code mc-rounded-input" style={{ fontSize: "13px", padding: "2px 8px" }}>
              {job.schedule_expr ?? "—"}
            </code>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <div>
              <div className="mc-tint-label" style={{ marginBottom: "4px" }}>Enabled</div>
              {job.enabled
                ? <McPill variant="success" size="xs">Active</McPill>
                : <McPill variant="ghost" size="xs">Paused</McPill>
              }
            </div>
            <div>
              <div className="mc-tint-label" style={{ marginBottom: "4px" }}>Last Status</div>
              {statusPill(job.last_status)}
            </div>
          </div>
          <div
            className="mc-text-faint"
            style={{
              display: "flex",
              gap: "24px",
              fontSize: "12px",
              paddingTop: "4px",
              borderTop: `1px solid ${TINT.blue.divider}`,
            }}
          >
            <span>Last run: {relativeTime(job.last_run_at)}</span>
            <span>Next run: {relativeTime(job.next_run_at)}</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Agent Tools ──────────────────────────────────────────────
  if (section === "tools" && key === "allowed") {
    return (
      <div>
        <SectionHeader emoji="🔧" label="Agent Tools" />
        <SectionDesc>Tools this agent is allowed to invoke during task execution.</SectionDesc>
        {agent.tools == null ? (
          <div className={TINT_CLASS.green}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>{"🛠️"}</span>
              <McPill variant="success" size="md">Unrestricted Access</McPill>
            </div>
            <p className="mc-text-faint" style={{ fontSize: "13px", marginLeft: "40px" }}>
              This agent has access to every tool in the system with no restrictions.
              Typically only the main orchestrator agent has this level of access.
            </p>
          </div>
        ) : agent.tools.length === 0 ? (
          <div className={TINT_CLASS.muted}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>{"🚫"}</span>
              <span className="mc-text-ghost" style={{ fontSize: "13px", fontWeight: 600 }}>No Tools Assigned</span>
            </div>
            <p className="mc-text-ghost" style={{ fontSize: "13px", marginLeft: "40px" }}>
              This agent cannot invoke any tools directly. It operates using only its language model.
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {agent.tools.map((t) => {
              const info = AGENT_TOOL_INFO[t];
              return (
                <div
                  key={t}
                  className={TINT_CLASS.indigo}
                  style={{
                    padding: "16px",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "12px",
                  }}
                >
                  <span style={{ fontSize: "20px", flexShrink: 0 }}>{info?.emoji ?? "⚙️"}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "13px" }}>{info?.name ?? t}</div>
                    {info?.desc && (
                      <div className="mc-text-faint" style={{ fontSize: "12px", marginTop: "2px" }}>{info.desc}</div>
                    )}
                    {info?.name && info.name !== t && (
                      <div className="mc-text-ghost" style={{ fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>{t}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Skills ─────────────────────────────────────────────────
  if (section === "skills") {
    const skills = agent.skills ?? [];

    const SKILL_INFO: Record<string, { name: string; emoji: string; desc: string }> = {
      "deep-research":           { name: "Deep Research",           emoji: "🔍", desc: "Multi-step research across web and memory stores with source verification" },
      "timeline-reconstruction": { name: "Timeline Reconstruction", emoji: "📅", desc: "Reconstruct chronological event timelines from scattered data sources" },
      "content-drafting":        { name: "Content Drafting",        emoji: "✍️", desc: "Draft content using structured frameworks (AIDA, PAS, StoryBrand, etc.)" },
      "revision":                { name: "Revision",                emoji: "📝", desc: "Multi-pass editing: structure, clarity, tone, and final polish" },
      "tool-selection":          { name: "Tool Selection",          emoji: "🎯", desc: "Decision tree to pick the best AI image/video tool for the brief" },
      "image-generation":        { name: "Image Generation",        emoji: "🖼️", desc: "Generate images via OpenAI, Gemini, Ideogram, or Replicate" },
      "video-generation":        { name: "Video Generation",        emoji: "🎬", desc: "Generate video content via Runway, Kling, or other services" },
      "supervise-coding":        { name: "Supervise Coding",        emoji: "👷", desc: "Manage Claude Code CLI sessions: prompt, monitor, review, deliver" },
      "code-review":             { name: "Code Review",             emoji: "🔎", desc: "Review pull requests and AI-generated code for quality and correctness" },
      "financial-search":        { name: "Financial Search",        emoji: "💰", desc: "Search financial records, invoices, and transaction history" },
      "subscription-sweep":      { name: "Subscription Sweep",      emoji: "🧹", desc: "Monthly audit of recurring subscriptions and spending patterns" },
      "send-email":              { name: "Send Email",              emoji: "📧", desc: "Validate and send emails via himalaya or gog CLI" },
      "send-message":            { name: "Send Message",            emoji: "💬", desc: "Validate and send messages via WhatsApp or iMessage" },
      "campaign-planning":       { name: "Campaign Planning",       emoji: "📊", desc: "Plan multi-channel marketing campaigns with briefs and timelines" },
      "brand-guardian":          { name: "Brand Guardian",          emoji: "🛡️", desc: "Enforce brand voice, visual identity, and style consistency" },
      "comms-routing":           { name: "Comms Routing",           emoji: "🔀", desc: "Route communications to the right agent based on type and urgency" },
      "heartbeat-monitoring":    { name: "Heartbeat Monitoring",    emoji: "💓", desc: "Periodic health checks, calendar, comms, and proactive outreach" },
      "memory-management":       { name: "Memory Management",       emoji: "🧠", desc: "Curate long-term memory, distil sessions, maintain knowledge base" },
      "detection-handler":       { name: "Detection Handler",       emoji: "🚨", desc: "Process security detections: classify, verify, and escalate threats" },
      "camera-verify":           { name: "Camera Verify",           emoji: "📹", desc: "Verify camera alerts with visual analysis to reduce false positives" },
      "hourly-check":            { name: "Hourly Check",            emoji: "⏱️", desc: "Regular health data monitoring and trend analysis" },
      "mc-logging":              { name: "Logging",                 emoji: "📋", desc: "Log health insights and updates to ClawControl activity" },
      "decision-matrix":         { name: "Decision Matrix",         emoji: "🤔", desc: "Evaluate home automation decisions using contextual rules" },
      "lights-check":            { name: "Lights Check",            emoji: "💡", desc: "Monitor and manage smart lighting schedules and scenes" },
      "task-review":             { name: "Task Review",             emoji: "✅", desc: "Review calendar, deadlines, and task priorities across projects" },
      "comms-scan":              { name: "Comms Scan",              emoji: "📡", desc: "Scan email, Slack, WhatsApp, and iMessage for new activity" },
      "urgent-detection":        { name: "Urgent Detection",        emoji: "🔴", desc: "Identify time-sensitive messages requiring immediate attention" },
      "response-tracker":        { name: "Response Tracker",        emoji: "📬", desc: "Track unanswered messages and flag items needing a reply" },
      "pipeline-check":          { name: "Pipeline Check",          emoji: "🔧", desc: "Monitor data pipeline health" },
      "overnight-memory":        { name: "Overnight Memory",        emoji: "🌙", desc: "Process overnight transcripts and update curated memory files" },
      "github-backup":           { name: "GitHub Backup",           emoji: "💾", desc: "Automated backup of workspace and config to GitHub" },
      "system-health":           { name: "System Health",           emoji: "⚙️", desc: "Monitor system resources, services, and infrastructure status" },
      "voice-reply":             { name: "Voice Reply",             emoji: "🎤", desc: "Generate voice responses using ElevenLabs TTS" },
      "image-gen":               { name: "Image Generation",        emoji: "🎨", desc: "Generate images on request via AI services" },
      "home-query":              { name: "Home Query",              emoji: "🏠", desc: "Query Home Assistant for device status and control" },
    };

    if (skills.length === 0) {
      return (
        <div>
          <SectionHeader emoji="⚡" label="Skills" />
          <SectionDesc>Specialised capabilities this agent can perform.</SectionDesc>
          <div className={TINT_CLASS.muted}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
              <span style={{ fontSize: "24px" }}>{"📭"}</span>
              <span className="mc-text-ghost" style={{ fontSize: "13px", fontWeight: 600 }}>No Skills Assigned</span>
            </div>
            <p className="mc-text-ghost" style={{ fontSize: "13px", marginLeft: "40px" }}>
              This agent has no dedicated skills. It operates using general capabilities only.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div>
        <SectionHeader emoji="⚡" label="Skills" />
        <SectionDesc>Specialised capabilities this agent can perform.</SectionDesc>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {skills.map((skill: string) => {
            const info = SKILL_INFO[skill];
            return (
              <div
                key={skill}
                className={TINT_CLASS.cyan}
                style={{
                  padding: "16px",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                }}
              >
                <span style={{ fontSize: "20px", flexShrink: 0 }}>{info?.emoji ?? "⚡"}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "13px" }}>{info?.name ?? skill}</div>
                  {info?.desc && (
                    <div className="mc-text-faint" style={{ fontSize: "12px", marginTop: "2px", lineHeight: 1.5 }}>
                      {info.desc}
                    </div>
                  )}
                  {info?.name && info.name !== skill && (
                    <div className="mc-text-ghost" style={{ fontSize: "11px", fontFamily: "monospace", marginTop: "4px" }}>
                      {skill}
                    </div>
                  )}
                  {!info && (
                    <div className="mc-text-ghost" style={{ fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>
                      {skill}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Access — Memory ────────────────────────────────────────────
  if (section === "access" && key === "memory") {
    const entries = agent.access?.memory ?? {};
    const withAccess = Object.entries(entries).filter(([, v]) => v != null);
    const without = Object.entries(entries).filter(([, v]) => v == null);
    return (
      <div>
        <SectionHeader emoji="💾" label="Memory Access" />
        <SectionDesc>
          Which memory stores this agent can read from or write to.
          Memory stores hold persistent knowledge, context, and relationships.
        </SectionDesc>
        {withAccess.length === 0 && without.length === 0 ? (
          <div className="mc-text-ghost" style={{ fontSize: "13px", padding: "16px" }}>No memory resources defined.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {withAccess.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {withAccess.map(([k, level]) => (
                  <ResourceCard key={k} rawKey={k} level={level} info={MEMORY_INFO[k]} />
                ))}
              </div>
            )}
            {without.length > 0 && (
              <div>
                <div className="mc-text-ghost" style={noAccessTextStyle}>No access</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {without.map(([k, level]) => (
                    <ResourceCard key={k} rawKey={k} level={level} info={MEMORY_INFO[k]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Access — Data Stores ───────────────────────────────────────
  if (section === "access" && key === "data_stores") {
    const entries = agent.access?.data_stores ?? {};
    const withAccess = Object.entries(entries).filter(([, v]) => v != null);
    const without = Object.entries(entries).filter(([, v]) => v == null);
    return (
      <div>
        <SectionHeader emoji="🗄️" label="Data Store Access" />
        <SectionDesc>
          External data sources this agent can query. Data stores include
          communications, documents, and personal databases.
        </SectionDesc>
        {withAccess.length === 0 && without.length === 0 ? (
          <div className="mc-text-ghost" style={{ fontSize: "13px", padding: "16px" }}>No data stores defined.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {withAccess.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {withAccess.map(([k, level]) => (
                  <ResourceCard key={k} rawKey={k} level={level} info={DATA_STORE_INFO[k]} />
                ))}
              </div>
            )}
            {without.length > 0 && (
              <div>
                <div className="mc-text-ghost" style={noAccessTextStyle}>No access</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {without.map(([k, level]) => (
                    <ResourceCard key={k} rawKey={k} level={level} info={DATA_STORE_INFO[k]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Access — Tools & Outputs ───────────────────────────────────────
  if (section === "access" && key === "tools") {
    const entries = agent.access?.tools ?? {};
    const withAccess = Object.entries(entries).filter(([, v]) => v != null);
    const without = Object.entries(entries).filter(([, v]) => v == null);
    return (
      <div>
        <SectionHeader emoji="⚡" label="Tool & Output Access" />
        <SectionDesc>
          Integration tools and their outputs that this agent can access.
          Determines which external services the agent can interact with.
        </SectionDesc>
        {withAccess.length === 0 && without.length === 0 ? (
          <div className="mc-text-ghost" style={{ fontSize: "13px", padding: "16px" }}>No tool access defined.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {withAccess.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                {withAccess.map(([k, level]) => (
                  <ResourceCard key={k} rawKey={k} level={level} info={TOOL_INFO[k]} />
                ))}
              </div>
            )}
            {without.length > 0 && (
              <div>
                <div className="mc-text-ghost" style={noAccessTextStyle}>No access</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  {without.map(([k, level]) => (
                    <ResourceCard key={k} rawKey={k} level={level} info={TOOL_INFO[k]} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── External Tools ─────────────────────────────────────────────
  if (section === "access" && key === "external_tools") {
    const entries = agent.access?.external_tools ?? {};
    const withAccess = Object.entries(entries).filter(([, v]) => v != null);
    return (
      <div>
        <SectionHeader emoji="🧰" label="External Tools" />
        <SectionDesc>
          Installed software and APIs available to this agent — image generators, scrapers, CLIs, and other external capabilities.
        </SectionDesc>
        {withAccess.length === 0 ? (
          <div className="mc-text-ghost" style={{ fontSize: "13px", padding: "16px" }}>No external tools installed.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            {withAccess.map(([k, level]) => (
              <ResourceCard key={k} rawKey={k} level={level} info={EXTERNAL_TOOL_INFO[k]} />
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Workspace files ────────────────────────────────────────────
  if (section === "workspace") {
    if (fileLoading) {
      return <span className="mc-text-faint" style={{ fontSize: "13px" }}>Loading…</span>;
    }
    const cacheKey = agent.id + "/" + key;
    const cached = fileCache[cacheKey];
    if (!cached) {
      return <span className="mc-text-faint" style={{ fontSize: "13px" }}>Click the file box to load.</span>;
    }
    if (!cached.exists) {
      return <span className="mc-text-faint" style={{ fontSize: "13px" }}>(not present in workspace)</span>;
    }
    return (
      <div className="prose prose-sm prose-invert mc-prose max-w-none overflow-auto">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cached.content ?? ""}</ReactMarkdown>
      </div>
    );
  }

  return null;
}

export default function AgentDetailPane({ agent, selectedBox, fileCache, fileLoading }: Props) {
  const [avatarError, setAvatarError] = useState<Record<string, boolean>>({});

  if (!agent || !selectedBox) {
    return (
      <div
        className="mc-text-ghost"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: "13px",
        }}
      >
        ← Select a setting to view details
      </div>
    );
  }

  return (
    <div style={{ overflow: "auto", height: "100%" }}>
      {renderDetail(agent, selectedBox, fileCache, fileLoading, avatarError, setAvatarError)}
    </div>
  );
}
