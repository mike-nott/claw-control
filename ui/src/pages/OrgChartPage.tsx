import { useEffect, useState } from "react";
import type { AgentConfig } from "../types";
import { getAgentConfigs } from "../api";
import { friendlyModelName } from "../utils/modelNames";

function hostFrom(primary: string | undefined): string {
  if (!primary) return "Unknown";
  if (primary.includes("anthropic")) return "Anthropic";
  if (primary.startsWith("local") || primary.includes("dgx") || primary.includes("ollama")) return "Local";
  const provider = primary.split("/")[0];
  return provider || "Unknown";
}

function triggerFrom(agent: AgentConfig): string {
  // Detect reactive agents by checking for absence of heartbeat/cron
  if (agent.heartbeat?.every) return `Heartbeat ${agent.heartbeat.every}`;
  if (agent.cron_jobs?.length > 0) return "Cron";
  return "On demand";
}

/* ── Card style palette — cycles for arbitrary team count ─────────── */

const TEAM_PALETTE = [
  { bg: "rgba(74, 222, 128, 0.15)", border: "rgba(74, 222, 128, 0.40)", gradientFrom: "#4ade80", gradientTo: "#22c55e", label: "#4ade80" },
  { bg: "rgba(96, 165, 250, 0.15)", border: "rgba(96, 165, 250, 0.40)", gradientFrom: "#60a5fa", gradientTo: "#3b82f6", label: "#60a5fa" },
  { bg: "rgba(251, 146, 60, 0.15)", border: "rgba(251, 146, 60, 0.40)", gradientFrom: "#fb923c", gradientTo: "#f97316", label: "#fb923c" },
  { bg: "rgba(192, 132, 252, 0.15)", border: "rgba(192, 132, 252, 0.40)", gradientFrom: "#c084fc", gradientTo: "#a855f7", label: "#c084fc" },
  { bg: "rgba(248, 113, 113, 0.15)", border: "rgba(248, 113, 113, 0.40)", gradientFrom: "#f87171", gradientTo: "#ef4444", label: "#f87171" },
];

const MAIN_STYLE = { bg: "rgba(99, 102, 241, 0.15)", border: "rgba(99, 102, 241, 0.40)", gradientFrom: "#818cf8", gradientTo: "#6366f1" };

/* ------------------------------------------------------------------ */
/*  Card component                                                     */
/* ------------------------------------------------------------------ */

type CardStyle = { bg: string; border: string; gradientFrom: string; gradientTo: string };

function AgentCard({ agent, style }: { agent: AgentConfig; style: CardStyle }) {
  return (
    <div
      className="rounded-xl p-3.5 relative overflow-hidden"
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(to right, ${style.gradientFrom}, ${style.gradientTo})` }}
      />
      <div className="flex items-center gap-2.5 mb-1.5">
        <img
          src={`/avatars/${agent.id}.png`}
          alt={agent.name}
          className="w-10 h-10 rounded-full object-cover shrink-0 border border-white/20"
        />
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate" style={{ color: "var(--mc-text-primary)" }}>{agent.name}</div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.5px]" style={{ color: "var(--mc-text-muted)" }}>{agent.title}</div>
        </div>
      </div>
      <div className="text-[11px] leading-[1.5] mt-1.5" style={{ color: "var(--mc-text-muted)" }}>{agent.bio}</div>
      <div className="flex gap-2 mt-2 flex-wrap">
        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold bg-[rgba(96,165,250,0.12)] text-[#60a5fa] border border-[rgba(96,165,250,0.2)]">
          {friendlyModelName(agent.model?.primary ?? "")}
        </span>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold bg-[rgba(192,132,252,0.12)] text-[#c084fc] border border-[rgba(192,132,252,0.2)]">
          {hostFrom(agent.model?.primary)}
        </span>
        <span className="text-[9px] px-2 py-0.5 rounded-full font-semibold bg-[rgba(251,146,60,0.12)] text-[#fb923c] border border-[rgba(251,146,60,0.2)]">
          {triggerFrom(agent)}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OrgChartPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAgentConfigs().then((data) => { setAgents(data); setLoading(false); });
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20" style={{ color: "var(--mc-text-faint)" }}>Loading...</div>;
  }

  const main = agents.find((a) => a.default);

  // Teams to show on the org chart (add/remove as needed)
  const VISIBLE_TEAMS = ["Assistants", "Operations", "Workers"];

  // Group remaining agents by team (excluding the default/main agent)
  const teamGroups: Record<string, AgentConfig[]> = {};
  for (const a of agents) {
    if (a.default) continue;
    const team = a.team || "Other";
    if (!VISIBLE_TEAMS.includes(team)) continue;
    if (!teamGroups[team]) teamGroups[team] = [];
    teamGroups[team].push(a);
  }
  const teamNames = VISIBLE_TEAMS.filter((t) => teamGroups[t]?.length > 0);

  return (
    <div className="max-w-[1200px] mx-auto">
      <h1 className="text-center text-[22px] font-bold mc-text-primary mb-1.5">The Crew — Org Chart</h1>
      <p className="text-center text-[13px] mc-text-faint mb-8">
        {agents.length} agents{teamNames.length > 0 && ` · ${teamNames.join(" · ")}`}
      </p>

      {/* Main agent — top */}
      {main && (
        <div className="flex justify-center mb-2">
          <div className="w-full max-w-[600px]">
            <AgentCard agent={main} style={MAIN_STYLE} />
          </div>
        </div>
      )}

      {/* Connector */}
      {main && teamNames.length > 0 && (
        <>
          <div className="w-0.5 h-6 mx-auto" style={{ background: "var(--mc-border)" }} />
          <div className="text-center text-[10px] my-1.5" style={{ color: "var(--mc-text-faint)" }}>
            ↙ escalations up &nbsp;·&nbsp; delegation down ↘
          </div>
        </>
      )}

      {/* Team columns */}
      <div className="flex gap-6">
        {teamNames.map((team, i) => {
          const palette = TEAM_PALETTE[i % TEAM_PALETTE.length];
          const members = teamGroups[team];
          const cardStyle: CardStyle = { bg: palette.bg, border: palette.border, gradientFrom: palette.gradientFrom, gradientTo: palette.gradientTo };
          return (
            <div key={team} className="flex-1 min-w-0">
              <div
                className="text-[10px] font-bold uppercase tracking-[2px] mb-3 pb-1.5 border-b"
                style={{ color: palette.label, borderColor: "var(--mc-border)" }}
              >
                {team}
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                {members.map((a) => (
                  <AgentCard key={a.id} agent={a} style={cardStyle} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
