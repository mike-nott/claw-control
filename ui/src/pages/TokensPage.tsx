import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";

import { getAgents, getTokenSummary, getTokensByAgent, getTokensByModel, getTokensTimeseries } from "../api";
import { McFilterBar, McPanel, McSelect, McSectionTitle } from "../components/mc";
import type { Agent } from "../types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend);

type RangeKey = "1h" | "today" | "7d" | "30d";

type SummaryTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
};

type TopAgent = { logicalAgent: string; tokens: number; cost: number };
type TopModel = { modelProvider: string; model: string; tokens: number; cost: number };

type SummaryResponse = {
  range: string;
  totals: SummaryTotals;
  topAgents: TopAgent[];
  topModels: TopModel[];
};

type AgentRow = {
  logicalAgent: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
};

type ModelRow = {
  modelProvider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  cost: number;
};

type SeriesRow = { bucketTs: string; tokens: number };

const RANGES: Array<{ key: RangeKey; label: string }> = [
  { key: "1h", label: "1h" },
  { key: "today", label: "Today" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" }
];

const nf = new Intl.NumberFormat();

function n(value: number | undefined): string {
  return nf.format(value ?? 0);
}

function toSummary(data: Record<string, unknown>): SummaryResponse {
  return {
    range: String(data.range ?? "today"),
    totals: (data.totals as SummaryTotals) ?? {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalCost: 0
    },
    topAgents: ((data.topAgents as TopAgent[]) ?? []).slice(0, 3),
    topModels: ((data.topModels as TopModel[]) ?? []).slice(0, 3),
  };
}

function fmtCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

/* ── Theme subscription (mirrors NavBar's store) ── */

const themeListeners = new Set<() => void>();

function getThemeSnapshot(): string {
  return document.documentElement.getAttribute("data-theme") ?? "dark";
}

function subscribeTheme(cb: () => void) {
  themeListeners.add(cb);

  // Listen for attribute changes on <html> so we pick up toggles from NavBar
  const observer = new MutationObserver(() => {
    themeListeners.forEach((fn) => fn());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return () => {
    themeListeners.delete(cb);
    observer.disconnect();
  };
}

/* ── Chart theme (reads computed CSS vars) ─────── */

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getChartTheme() {
  return {
    grid: getCssVar("--mc-border-row") || "rgba(255,255,255,0.04)",
    ticks: getCssVar("--mc-text-muted") || "#94a3b8",
    tooltipBg: getCssVar("--mc-surface-3") || "#222836",
    tooltipText: getCssVar("--mc-text-primary") || "#f8fafc",
    tooltipBorder: getCssVar("--mc-indigo") || "#6366f1",
    indigo: getCssVar("--mc-indigo") || "#6366f1",
    blue: getCssVar("--mc-blue") || "#3b82f6",
  };
}

function buildChartOptions(theme: ReturnType<typeof getChartTheme>) {
  const scales = {
    x: {
      grid: { color: theme.grid },
      ticks: { color: theme.ticks },
    },
    y: {
      grid: { color: theme.grid },
      ticks: { color: theme.ticks },
    },
  };
  const tooltip = {
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: theme.tooltipText,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
  };
  return {
    line: {
      maintainAspectRatio: false,
      responsive: true,
      scales,
      plugins: {
        tooltip,
        legend: { display: false },
      },
    },
    bar: {
      maintainAspectRatio: false,
      responsive: true,
      scales,
      plugins: {
        tooltip,
        legend: { display: false as const },
      },
    },
  };
}

/* ── Stat card styles ───────────────────────────── */

const statLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
  marginTop: "4px",
  fontVariantNumeric: "tabular-nums",
};

const statSubStyle: React.CSSProperties = {
  fontSize: "12px",
  fontVariantNumeric: "tabular-nums",
};

/* ── Table styles ───────────────────────────────── */

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "12px",
};

/* ── Component ──────────────────────────────────── */

export default function TokensPage() {
  const [range, setRange] = useState<RangeKey>("today");
  const [agentFilter, setAgentFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [byAgent, setByAgent] = useState<AgentRow[]>([]);
  const [byModel, setByModel] = useState<ModelRow[]>([]);
  const [allAgentNames, setAllAgentNames] = useState<string[]>([]);
  const [allModelNames, setAllModelNames] = useState<string[]>([]);
  const [timeseries, setTimeseries] = useState<SeriesRow[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Map agent display name → emoji (for token data keyed by logicalAgent name)
  const agentEmojiByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      if (a.emoji) map.set(a.name, a.emoji);
    }
    return map;
  }, [agents]);

  // Re-render on theme change so chart colours update
  const currentTheme = useSyncExternalStore(subscribeTheme, getThemeSnapshot);
  const chartTheme = useMemo(() => getChartTheme(), [currentTheme]);
  const { line: lineChartOptions, bar: barChartOptions } = useMemo(
    () => buildChartOptions(chartTheme),
    [chartTheme]
  );

  const load = async () => {
    try {
      const agentParam = agentFilter !== "all" ? agentFilter : undefined;
      const modelParam = modelFilter !== "all" ? modelFilter : undefined;
      const hasFilter = agentParam || modelParam;

      const promises: Promise<unknown>[] = [
        getTokenSummary(range, agentParam, modelParam),
        getTokensByAgent(range, agentParam, modelParam),
        getTokensByModel(range, agentParam, modelParam),
        getTokensTimeseries(range, agentParam, modelParam),
      ];
      // Also fetch unfiltered lists for dropdown options when filters are active
      if (hasFilter) {
        promises.push(getTokensByAgent(range), getTokensByModel(range));
      }

      const results = await Promise.all(promises);
      const [summaryRaw, agentsRaw, modelsRaw, seriesRaw] = results as [
        Record<string, unknown>, Record<string, unknown>[], Record<string, unknown>[], Record<string, unknown>[]
      ];

      setSummary(toSummary(summaryRaw));
      setByAgent((agentsRaw as AgentRow[]) ?? []);
      setByModel((modelsRaw as ModelRow[]) ?? []);
      setTimeseries((seriesRaw as SeriesRow[]) ?? []);

      if (hasFilter) {
        const unfilteredAgents = (results[4] as AgentRow[]) ?? [];
        const unfilteredModels = (results[5] as ModelRow[]) ?? [];
        setAllAgentNames(unfilteredAgents.map((r) => r.logicalAgent));
        setAllModelNames(unfilteredModels.map((r) => r.model));
      } else {
        setAllAgentNames(((agentsRaw as AgentRow[]) ?? []).map((r) => r.logicalAgent));
        setAllModelNames(((modelsRaw as ModelRow[]) ?? []).map((r) => r.model));
      }

      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load token data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void getAgents().then(setAgents).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [range, agentFilter, modelFilter]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 15000);
    return () => window.clearInterval(id);
  }, [range, agentFilter, modelFilter]);

  const lineData = useMemo(
    () => ({
      labels: timeseries.map((item) => new Date(item.bucketTs).toLocaleTimeString()),
      datasets: [
        {
          label: "Tokens",
          data: timeseries.map((item) => item.tokens),
          borderColor: chartTheme.indigo,
          backgroundColor: chartTheme.indigo + "26", /* ~15% opacity */
          fill: true,
          tension: 0.25,
          pointRadius: 1.5
        }
      ]
    }),
    [timeseries, chartTheme]
  );

  const byAgentChartData = useMemo(
    () => ({
      labels: byAgent.slice(0, 10).map((item) => {
        const emoji = agentEmojiByName.get(item.logicalAgent);
        return emoji ? `${emoji} ${item.logicalAgent}` : item.logicalAgent;
      }),
      datasets: [
        {
          label: "Tokens",
          data: byAgent.slice(0, 10).map((item) => item.total),
          backgroundColor: chartTheme.indigo
        }
      ]
    }),
    [byAgent, chartTheme, agentEmojiByName]
  );

  const byModelChartData = useMemo(
    () => ({
      labels: byModel.slice(0, 12).map((item) => `${item.modelProvider}/${item.model}`),
      datasets: [
        {
          label: "Tokens",
          data: byModel.slice(0, 12).map((item) => item.total),
          backgroundColor: chartTheme.blue
        }
      ]
    }),
    [byModel, chartTheme]
  );

  const totals = summary?.totals ?? {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalCost: 0
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Filter bar */}
      <McFilterBar>
        <div style={{ display: "flex", gap: "4px" }}>
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setRange(item.key)}
              className={`mc-tab-pill-bordered ${range === item.key ? "active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <McSelect value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}>
          <option value="all">All Agents</option>
          {allAgentNames.map((name) => {
            const emoji = agentEmojiByName.get(name);
            return <option key={name} value={name}>{emoji ? `${emoji} ${name}` : name}</option>;
          })}
        </McSelect>
        <McSelect value={modelFilter} onChange={(e) => setModelFilter(e.target.value)}>
          <option value="all">All Models</option>
          {allModelNames.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </McSelect>
        <div style={{ flex: 1 }} />
        <span className="mc-text-faint" style={{ fontSize: "12px" }}>
          Last updated: {lastUpdated ? lastUpdated.toLocaleTimeString() : "Never"}
        </span>
      </McFilterBar>

      {/* Error */}
      {error && (
        <div className="mc-alert-warning">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(3, 1fr)" }}>
        {/* Total Tokens */}
        <McPanel padding="none">
          <div className="mc-bar-indigo" style={{ height: "3px" }} />
          <div style={{ padding: "16px" }}>
            <p className="mc-text-muted" style={statLabelStyle}>Total Tokens</p>
            <p className="mc-text-primary" style={statValueStyle}>{n(totals.totalTokens)}</p>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <p className="mc-text-faint" style={statSubStyle}>Input: {n(totals.inputTokens)}</p>
              <p className="mc-text-faint" style={statSubStyle}>Output: {n(totals.outputTokens)}</p>
              <p className="mc-text-faint" style={statSubStyle}>Cache Read: {n(totals.cacheReadTokens)}</p>
              <p className="mc-text-faint" style={statSubStyle}>Cache Write: {n(totals.cacheWriteTokens)}</p>
              <p className="mc-text-faint" style={{ ...statSubStyle, marginTop: "4px" }}>Cost: {fmtCost(totals.totalCost ?? 0)}</p>
            </div>
          </div>
        </McPanel>

        {/* Top Agents */}
        <McPanel padding="none">
          <div className="mc-bar-green" style={{ height: "3px" }} />
          <div style={{ padding: "16px" }}>
            <p className="mc-text-muted" style={statLabelStyle}>Top Agents</p>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {(summary?.topAgents ?? []).map((item) => (
                <p key={item.logicalAgent} className="mc-text-body" style={{ fontSize: "13px" }}>
                  {agentEmojiByName.get(item.logicalAgent) && (
                    <span style={{ marginRight: "4px" }}>{agentEmojiByName.get(item.logicalAgent)}</span>
                  )}
                  {item.logicalAgent}:{" "}
                  <span className="mc-text-faint" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {n(item.tokens)}
                  </span>
                  <span className="mc-text-ghost" style={{ fontVariantNumeric: "tabular-nums", marginLeft: "6px", fontSize: "11px" }}>
                    {fmtCost(item.cost)}
                  </span>
                </p>
              ))}
              {!(summary?.topAgents?.length ?? 0) && (
                <p className="mc-text-faint" style={{ fontSize: "13px" }}>No data</p>
              )}
            </div>
          </div>
        </McPanel>

        {/* Top Models */}
        <McPanel padding="none">
          <div className="mc-bar-purple" style={{ height: "3px" }} />
          <div style={{ padding: "16px" }}>
            <p className="mc-text-muted" style={statLabelStyle}>Top Models</p>
            <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
              {(summary?.topModels ?? []).map((item) => (
                <p key={`${item.modelProvider}-${item.model}`} className="mc-text-body" style={{ fontSize: "13px" }}>
                  {item.modelProvider}/{item.model}:{" "}
                  <span className="mc-text-faint" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {n(item.tokens)}
                  </span>
                  <span className="mc-text-ghost" style={{ fontVariantNumeric: "tabular-nums", marginLeft: "6px", fontSize: "11px" }}>
                    {fmtCost(item.cost)}
                  </span>
                </p>
              ))}
              {!(summary?.topModels?.length ?? 0) && (
                <p className="mc-text-faint" style={{ fontSize: "13px" }}>No data</p>
              )}
            </div>
          </div>
        </McPanel>
      </div>

      {/* Tokens Over Time */}
      <McPanel>
        <McSectionTitle>Tokens Over Time</McSectionTitle>
        <div style={{ height: "224px" }}>
          {loading ? (
            <p className="mc-text-muted" style={{ fontSize: "13px" }}>Loading...</p>
          ) : (
            <Line data={lineData} options={lineChartOptions} />
          )}
        </div>
      </McPanel>

      {/* By Agent */}
      <McPanel>
        <McSectionTitle>By Agent</McSectionTitle>
        <div style={{ height: "192px" }}>
          <Bar data={byAgentChartData} options={barChartOptions} />
        </div>
      </McPanel>

      {/* By Model */}
      <McPanel>
        <McSectionTitle>By Model</McSectionTitle>
        <div style={{ height: "192px" }}>
          <Bar data={byModelChartData} options={barChartOptions} />
        </div>
      </McPanel>

      {/* Tables */}
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "repeat(2, 1fr)" }}>
        {/* Agents table */}
        <McPanel>
          <McSectionTitle>Agents</McSectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th className="mc-th">Agent</th>
                  <th className="mc-th">Total</th>
                  <th className="mc-th">Cost</th>
                  <th className="mc-th">Input</th>
                  <th className="mc-th">Output</th>
                  <th className="mc-th">Cache Read</th>
                  <th className="mc-th">Cache Write</th>
                </tr>
              </thead>
              <tbody>
                {byAgent.map((row) => (
                  <tr
                    key={row.logicalAgent}
                    className="mc-hover-row"
                  >
                    <td className="mc-td mc-text-primary" style={{ fontWeight: 600 }}>
                      {agentEmojiByName.get(row.logicalAgent) && (
                        <span style={{ marginRight: "4px" }}>{agentEmojiByName.get(row.logicalAgent)}</span>
                      )}
                      {row.logicalAgent}
                    </td>
                    <td className="mc-td">{n(row.total)}</td>
                    <td className="mc-td">{fmtCost(row.cost)}</td>
                    <td className="mc-td">{n(row.inputTokens)}</td>
                    <td className="mc-td">{n(row.outputTokens)}</td>
                    <td className="mc-td">{n(row.cacheRead)}</td>
                    <td className="mc-td">{n(row.cacheWrite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </McPanel>

        {/* Models table */}
        <McPanel>
          <McSectionTitle>Models</McSectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th className="mc-th">Provider</th>
                  <th className="mc-th">Model</th>
                  <th className="mc-th">Total</th>
                  <th className="mc-th">Cost</th>
                  <th className="mc-th">Input</th>
                  <th className="mc-th">Output</th>
                  <th className="mc-th">Cache Read</th>
                  <th className="mc-th">Cache Write</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((row) => (
                  <tr
                    key={`${row.modelProvider}-${row.model}`}
                    className="mc-hover-row"
                  >
                    <td className="mc-td mc-text-primary" style={{ fontWeight: 600 }}>
                      {row.modelProvider}
                    </td>
                    <td className="mc-td mc-text-primary">{row.model}</td>
                    <td className="mc-td">{n(row.total)}</td>
                    <td className="mc-td">{fmtCost(row.cost)}</td>
                    <td className="mc-td">{n(row.inputTokens)}</td>
                    <td className="mc-td">{n(row.outputTokens)}</td>
                    <td className="mc-td">{n(row.cacheRead)}</td>
                    <td className="mc-td">{n(row.cacheWrite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </McPanel>
      </div>
    </div>
  );
}
