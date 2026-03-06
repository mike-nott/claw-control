import { useCallback, useEffect, useRef, useState } from "react";

import { getStatus } from "../api";
import { McPanel, McPill, McSectionTitle } from "../components/mc";
import type {
  StatusAgent,
  StatusGateway,
  StatusLlmServer,
  StatusResponse,
  StatusService,
} from "../types";

const POLL_INTERVAL = 30_000;

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "--";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function tempColor(temp: number | null): "success" | "warning" | "error" | "ghost" {
  if (temp == null) return "ghost";
  if (temp < 60) return "success";
  if (temp <= 80) return "warning";
  return "error";
}

// ── Gateway Bar ──────────────────────────────────

function GatewayBar({ gw }: { gw: StatusGateway }) {
  const borderCls = gw.status === "down" ? "mc-border-pulse-red"
    : gw.active ? "mc-border-pulse-green" : "";
  return (
    <McPanel padding="sm" className={borderCls}>
      <div className="flex items-center gap-4 flex-wrap">
        <McSectionTitle>Gateway</McSectionTitle>
        <McPill variant={gw.status === "ok" ? "success" : "error"} size="sm">
          {gw.status === "ok" ? "Online" : "Down"}
        </McPill>
        {gw.uptime_seconds != null && (
          <span className="text-xs mc-text-muted">
            Uptime: <span className="mc-text-primary font-medium">{formatUptime(gw.uptime_seconds)}</span>
          </span>
        )}
        {gw.version && (
          <span className="text-xs mc-text-muted">
            v<span className="mc-text-primary font-medium">{gw.version}</span>
          </span>
        )}
        {gw.session && gw.session.context_percent > 0 && (
          <span className="text-xs mc-text-muted">
            {"\uD83D\uDCDA"} Context: <span className="mc-text-primary font-medium">{gw.session.context_percent}%</span>
          </span>
        )}
        {gw.session && (
          <span className="text-xs mc-text-muted">
            {"\uD83E\uDDF9"} Compactions: <span className="mc-text-primary font-medium">{gw.session.compactions}</span>
          </span>
        )}
      </div>
      {gw.session && (
        <div className="flex items-center gap-3 mt-1 text-xs">
          <span className="mc-text-muted">
            {"\uD83E\uDDE0"} <span className="mc-text-primary font-medium">{gw.session.model?.replace("Intel/", "")}</span>
          </span>
        </div>
      )}
    </McPanel>
  );
}

// Map agent model provider prefixes to LLM server display names.
// This lets agent avatars appear on the correct server card.
// Keys = provider prefix from sessions.json modelProvider field.
// Values = must match server "name" in the backend LLM_SERVERS config.
const PROVIDER_TO_SERVER: Record<string, string> = {
  // "my-gpu-server": "GPU Server",
  // "ollama": "Local Ollama",
};

function getActiveAgentsForServer(serverName: string, agents: StatusAgent[]): StatusAgent[] {
  return agents.filter((a) => {
    if (a.status !== "active") return false;
    // Use current_provider (from session JSONL) — reflects fallback correctly
    const provider = a.current_provider ?? a.model?.primary?.split("/")[0];
    if (!provider) return false;
    return PROVIDER_TO_SERVER[provider] === serverName;
  });
}

// ── LLM Server Card ──────────────────────────────

function LlmServerCard({ server, activeAgents }: { server: StatusLlmServer; activeAgents: StatusAgent[] }) {
  const isUp = server.status === "ok";
  const m = server.metrics;
  const gl = server.glances;
  const gpu = gl?.gpu;

  return (
    <div className={`p-3 mc-rounded-inner mc-bg-1 ${!isUp ? "mc-border-pulse-red" : server.active ? "mc-border-pulse-green" : "mc-border"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold mc-text-primary">{server.name}</span>
        <div className="flex items-center gap-1.5">
          {isUp && m && m.prompt_tokens_per_sec != null && (
            <McPill variant="ghost" size="xs">
              {m.prompt_tokens_per_sec.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t/s prompt
            </McPill>
          )}
          {isUp && m && m.gen_tokens_per_sec != null && (
            <McPill variant="cyan" size="xs">
              {m.gen_tokens_per_sec.toFixed(1)} t/s gen
            </McPill>
          )}
        </div>
      </div>

      {server.model && (
        <p className="text-xs mc-text-muted mb-2 truncate" title={server.model}>
          {server.model.replace("Intel/", "")}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-2">
        <McPill variant="ghost" size="xs">{server.runtime}</McPill>
        <McPill variant={isUp ? "success" : "error"} size="xs">
          {server.status}
        </McPill>
        {isUp && m && m.requests_waiting != null && m.requests_waiting > 0 && (
          <McPill variant="warning" size="xs">
            {m.requests_waiting} queued
          </McPill>
        )}
      </div>

      {gpu && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {gpu.name && (
            <span className="text-xs mc-text-ghost font-medium">{gpu.name?.replace("NVIDIA GeForce ", "")}</span>
          )}
          {gpu.proc != null && (
            <McPill variant={gpu.proc > 95 ? "error" : "success"} size="xs">
              proc {gpu.proc.toFixed(0)}%
            </McPill>
          )}
          {(gpu.mem ?? gl?.ram_percent) != null && (
            <McPill variant="ghost" size="xs">
              VRAM {(gpu.mem ?? gl?.ram_percent)!.toFixed(0)}%
            </McPill>
          )}
          {gpu.temp != null && (
            <McPill variant={tempColor(gpu.temp)} size="xs">
              {gpu.temp}{"\u00B0"}C
            </McPill>
          )}
          {gpu.fan != null && (
            <McPill variant="ghost" size="xs">
              fan {gpu.fan}%
            </McPill>
          )}
        </div>
      )}

      {gl && !gpu && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {gl.cpu_percent != null && (
            <McPill variant="ghost" size="xs">CPU {gl.cpu_percent.toFixed(0)}%</McPill>
          )}
          {gl.ram_percent != null && (
            <McPill variant="ghost" size="xs">RAM {gl.ram_percent.toFixed(0)}%</McPill>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 text-xs mc-text-ghost">
        <span>{server.host}:{server.port}</span>
        {server.response_ms != null && <span>{server.response_ms}ms</span>}
        {activeAgents.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            {activeAgents.map((a) => (
              <img
                key={a.id}
                src={`/avatars/${a.id}.png`}
                alt={a.name}
                title={a.name}
                className="w-7 h-7 rounded-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Services Row ─────────────────────────────────

function ServicesRow({ services }: { services: StatusService[] }) {
  const anyDown = services.some((s) => s.status !== "ok");
  return (
    <McPanel padding="sm" className={anyDown ? "mc-border-pulse-red" : ""}>
      <McSectionTitle>Services</McSectionTitle>
      <div className="flex flex-wrap gap-1.5">
        {services.map((svc) => (
          <McPill
            key={svc.name}
            variant={svc.status === "ok" ? "success" : "error"}
            size="sm"
          >
            {svc.status === "ok" ? "\u2705" : "\u274C"} {svc.name}
            {svc.response_ms != null && <span className="ml-1 opacity-70">{svc.response_ms}ms</span>}
          </McPill>
        ))}
      </div>
    </McPanel>
  );
}

// ── Agent Card ───────────────────────────────────

function AgentCard({ agent, needsFallback }: { agent: StatusAgent; needsFallback: boolean }) {
  const borderCls = agent.status === "active" ? "mc-border-pulse-green" : agent.status === "error" ? "mc-border-pulse-red" : "mc-border";
  return (
    <div className={`p-3 mc-rounded-inner mc-bg-1 ${borderCls} flex flex-col items-center text-center gap-2`}>
      <img
        src={`/avatars/${agent.id}.png`}
        alt={agent.name}
        className="w-12 h-12 rounded-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div>
        <div className="text-sm font-semibold mc-text-primary">{agent.name}</div>
        <McPill
          variant={agent.status === "active" ? "success" : agent.status === "error" ? "error" : "ghost"}
          size="xs"
        >
          {agent.status}
        </McPill>
      </div>
      {needsFallback && (
        <McPill variant="warning" size="xs">fallback</McPill>
      )}
    </div>
  );
}

// ── Agent Overview ───────────────────────────────

function AgentOverview({ data, downServers }: { data: StatusResponse["agents"]; downServers: Set<string> }) {
  return (
    <div>
      <div className="mb-3">
        <McSectionTitle>Agents</McSectionTitle>
      </div>

      <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
        {data.agents.map((a: StatusAgent) => (
          <AgentCard key={a.id} agent={a} needsFallback={_agentNeedsFallback(a, downServers)} />
        ))}
      </div>
    </div>
  );
}

function _agentNeedsFallback(agent: StatusAgent, downServers: Set<string>): boolean {
  if (!agent.model?.primary) return false;
  // Cloud providers (anthropic, openai) assumed up
  const provider = agent.model.primary.split("/")[0];
  if (provider === "anthropic" || provider === "openai") return false;
  // Check if the server name prefix matches any down server
  for (const ds of downServers) {
    if (agent.model.primary.toLowerCase().includes(ds.toLowerCase())) return true;
  }
  return false;
}

// ── Status Page ──────────────────────────────────

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [tickCounter, setTickCounter] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const result = await getStatus();
      setData(result);
      setError(null);
      setLastFetched(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
    intervalRef.current = setInterval(() => { void fetchData(); }, POLL_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  // Tick every 5s to update "last updated" display
  useEffect(() => {
    const t = setInterval(() => setTickCounter((c) => c + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const secondsAgo = lastFetched
    ? Math.floor((Date.now() - lastFetched.getTime()) / 1000)
    : null;

  // Track which LLM servers are down (for fallback indicators)
  const downServers = new Set<string>();
  if (data) {
    for (const s of data.llm_servers) {
      if (s.status === "down") downServers.add(s.name);
    }
  }

  // Suppress unused var warning — tickCounter drives re-render for secondsAgo
  void tickCounter;

  if (loading && !data) {
    return (
      <McPanel>
        <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading status...</p>
      </McPanel>
    );
  }

  if (error && !data) {
    return (
      <McPanel>
        <p className="text-sm" style={{ color: "var(--mc-red)" }}>Error: {error}</p>
      </McPanel>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      {/* Last updated indicator */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold mc-text-primary">Infrastructure Status</h2>
        <span className="text-xs mc-text-ghost">
          {secondsAgo != null && (
            <>Updated {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}</>
          )}
          {error && <span className="ml-2" style={{ color: "var(--mc-red)" }}>(refresh failed)</span>}
        </span>
      </div>

      {/* 1. Gateway + Services row */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GatewayBar gw={data.gateway} />
        </div>
        <div>
          <ServicesRow services={data.services} />
        </div>
      </div>

      {/* 2. LLM Servers */}
      <div>
        <McSectionTitle>LLM Servers</McSectionTitle>
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {data.llm_servers.map((s) => (
            <LlmServerCard
              key={`${s.host}:${s.port}`}
              server={s}
              activeAgents={getActiveAgentsForServer(s.name, data.agents.agents)}
            />
          ))}
        </div>
      </div>

      {/* 4. Agents */}
      <AgentOverview data={data.agents} downServers={downServers} />
    </div>
  );
}
