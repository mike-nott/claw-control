import { useCallback, useEffect, useMemo, useState } from "react";

import { getAgents, getScheduleDetail, getSchedules } from "../api";
import { McFilterBar, McPanel, McPill, McSelect, McSectionTitle } from "../components/mc";
import { connectStream } from "../sse";
import type { Agent, ScheduleDetail, ScheduleEntry, StreamEvent } from "../types";

type StatusVariant = "success" | "warning" | "error" | "info" | "ghost";

const STATUS_VARIANT: Record<string, StatusVariant> = {
  ok: "success",
  late: "warning",
  error: "error",
  running: "info",
  idle: "ghost",
  disabled: "ghost",
};

const STATUS_TEXT_CLASS: Record<string, string> = {
  ok: "mc-text-green",
  late: "mc-text-orange",
  error: "mc-text-red",
  running: "mc-text-blue",
  idle: "mc-text-muted",
  disabled: "mc-text-faint",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function timeUntil(dateStr: string): { text: string; overdue: boolean } {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) {
    const ago = Math.abs(diff);
    const mins = Math.floor(ago / 60000);
    if (mins < 60) return { text: `overdue ${mins}m`, overdue: true };
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return { text: `overdue ${hrs}h`, overdue: true };
    const days = Math.floor(hrs / 24);
    return { text: `overdue ${days}d`, overdue: true };
  }
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return { text: "< 1m", overdue: false };
  if (mins < 60) return { text: `in ${mins}m`, overdue: false };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { text: `in ${hrs}h`, overdue: false };
  const days = Math.floor(hrs / 24);
  return { text: `in ${days}d`, overdue: false };
}

export default function SchedulePage() {
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ScheduleDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Filters
  const [filterSource, setFilterSource] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");

  // Fetch agents once on mount
  useEffect(() => {
    void getAgents().then(setAgents).catch(() => {});
  }, []);

  const agentEmoji = useCallback((agentId: string | null): string => {
    if (!agentId) return "";
    return agents.find((a) => a.id === agentId)?.emoji || "";
  }, [agents]);

  const agentName = useCallback((agentId: string | null): string => {
    if (!agentId) return "";
    return agents.find((a) => a.id === agentId)?.name || agentId;
  }, [agents]);

  // Fetch schedules
  const fetchSchedules = useCallback(async () => {
    try {
      const data = await getSchedules();
      setEntries(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSchedules();
  }, [fetchSchedules]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      void getSchedules().then(setEntries).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // SSE for live activity updates
  useEffect(() => {
    return connectStream({
      onEvent: (event: StreamEvent) => {
        if (event.type === "activity.created") {
          void getSchedules().then(setEntries).catch(() => {});
        }
      },
      onError: () => {},
    });
  }, []);

  // Fetch detail when selection changes
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    void getScheduleDetail(selectedId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setDetailLoading(false));
  }, [selectedId]);

  // Filtered and sorted entries
  const filteredEntries = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (filterSource && e.source !== filterSource) return false;
      if (filterStatus && e.status !== filterStatus) return false;
      if (filterAgent && e.agent !== filterAgent) return false;
      return true;
    });
    filtered.sort((a, b) => {
      if (!a.last_run_at && !b.last_run_at) return 0;
      if (!a.last_run_at) return 1;
      if (!b.last_run_at) return -1;
      return new Date(b.last_run_at).getTime() - new Date(a.last_run_at).getTime();
    });
    return filtered;
  }, [entries, filterSource, filterStatus, filterAgent]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Filter bar */}
      <McFilterBar>
        <McSelect value={filterSource} onChange={(e) => setFilterSource(e.target.value)}>
          <option value="">All types</option>
          <option value="cron">Cron Jobs</option>
          <option value="launchd">Launchd Scripts</option>
          <option value="heartbeat">Heartbeat</option>
        </McSelect>

        <McSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ok">OK</option>
          <option value="late">Late</option>
          <option value="error">Error</option>
          <option value="running">Running</option>
          <option value="idle">Idle</option>
          <option value="disabled">Disabled</option>
        </McSelect>

        <McSelect value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </McSelect>
      </McFilterBar>

      {/* Main grid */}
      <div style={{ display: "flex", gap: "16px", minHeight: "calc(100vh - 160px)" }}>
        {/* Left pane — schedule table */}
        <div style={{ flex: 2, minWidth: 0 }}>
        <McPanel padding="none">
          {loading ? (
            <div className="mc-text-muted" style={{ padding: "24px", fontSize: "13px" }}>
              Loading schedules...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="mc-text-muted" style={{ padding: "24px", fontSize: "13px" }}>
              No schedules matching filters.
            </div>
          ) : (
            <div style={{ overflow: "auto" }}>
              {/* Table */}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Status", "Type", "Task", "Agent", "Model", "Schedule", "Last Run", "Next"].map((h) => (
                      <th key={h} className="mc-th" style={{ padding: "10px 12px" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((entry) => {
                    const isSelected = selectedId === entry.id;
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
                        className="mc-border-row"
                        style={{
                          cursor: "pointer",
                          transition: "background 0.1s",
                          background: isSelected ? "rgba(99, 102, 241, 0.08)" : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = isSelected
                            ? "rgba(99, 102, 241, 0.08)"
                            : "transparent";
                        }}
                      >
                        {/* Status */}
                        <td style={{ padding: "10px 12px" }}>
                          <McPill
                            variant={STATUS_VARIANT[entry.status] || "ghost"}
                            size="xs"
                            className={entry.status === "disabled" ? "line-through" : ""}
                          >
                            {entry.status}
                          </McPill>
                        </td>

                        {/* Type */}
                        <td className="mc-text-muted" style={{ padding: "10px 12px", fontSize: "12px" }}>
                          {entry.source}
                        </td>

                        {/* Task */}
                        <td className="mc-text-primary" style={{ padding: "10px 12px", fontSize: "12px", fontWeight: 600 }}>
                          {entry.task}
                        </td>

                        {/* Agent */}
                        <td className="mc-text-body" style={{ padding: "10px 12px", fontSize: "12px" }}>
                          {entry.agent
                            ? <span>{agentEmoji(entry.agent)} {agentName(entry.agent)}</span>
                            : <span className="mc-text-ghost">{"\u2014"}</span>}
                        </td>

                        {/* Model */}
                        <td className="mc-text-faint" style={{ padding: "10px 12px", fontSize: "12px" }}>
                          {entry.model || <span className="mc-text-ghost">{"\u2014"}</span>}
                        </td>

                        {/* Schedule */}
                        <td className="mc-text-faint" style={{ padding: "10px 12px", fontSize: "12px" }}>
                          {entry.schedule_human || <span className="mc-text-ghost">{"\u2014"}</span>}
                        </td>

                        {/* Last Run */}
                        <td
                          className={
                            entry.last_status === "error"
                              ? "mc-text-red"
                              : entry.last_run_at
                                ? "mc-text-faint"
                                : "mc-text-ghost"
                          }
                          style={{ padding: "10px 12px", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}
                        >
                          {entry.last_run_at ? timeAgo(entry.last_run_at) : "\u2014"}
                        </td>

                        {/* Next */}
                        <td style={{ padding: "10px 12px", fontSize: "12px", fontVariantNumeric: "tabular-nums" }}>
                          {entry.next_run_at ? (() => {
                            const t = timeUntil(entry.next_run_at);
                            return (
                              <span
                                className={t.overdue ? "mc-text-orange" : "mc-text-body"}
                                style={{ fontWeight: t.overdue ? 600 : 400 }}
                              >
                                {t.text}
                              </span>
                            );
                          })() : <span className="mc-text-ghost">{"\u2014"}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </McPanel>
        </div>

        {/* Right pane — detail panel */}
        <div style={{ flex: 1, minWidth: "320px" }}>
          <DetailPanel
            entry={detail}
            loading={detailLoading}
            selectedId={selectedId}
            agentEmoji={agentEmoji}
            agentName={agentName}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Detail Panel ──────────────────────────────────── */

const statCardStyle: React.CSSProperties = {
  background: "rgba(0, 0, 0, 0.2)",
  borderRadius: "10px",
  padding: "12px",
};
const statLabelStyle: React.CSSProperties = {
  fontSize: "10px",
  marginBottom: "4px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};
const statValueStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
};
const statSubStyle: React.CSSProperties = {
  fontSize: "10px",
  marginTop: "2px",
};

function DetailPanel({
  entry,
  loading,
  selectedId,
  agentEmoji,
  agentName,
}: {
  entry: ScheduleDetail | null;
  loading: boolean;
  selectedId: string | null;
  agentEmoji: (id: string | null) => string;
  agentName: (id: string | null) => string;
}) {
  if (!selectedId) {
    return (
      <McPanel>
        <McSectionTitle>Schedule Detail</McSectionTitle>
        <p className="mc-text-muted" style={{ marginTop: "8px", fontSize: "13px" }}>
          Select a job to see details.
        </p>
      </McPanel>
    );
  }

  if (loading) {
    return (
      <McPanel>
        <McSectionTitle>Schedule Detail</McSectionTitle>
        <p className="mc-text-muted" style={{ marginTop: "8px", fontSize: "13px" }}>
          Loading...
        </p>
      </McPanel>
    );
  }

  if (!entry) {
    return (
      <McPanel>
        <McSectionTitle>Schedule Detail</McSectionTitle>
        <p className="mc-text-muted" style={{ marginTop: "8px", fontSize: "13px" }}>
          Failed to load details.
        </p>
      </McPanel>
    );
  }

  return (
    <McPanel padding="none">
      {/* Header */}
      <div className="mc-border-bottom" style={{ padding: "16px" }}>
        <div className="mc-text-primary" style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px" }}>
          {entry.agent ? agentEmoji(entry.agent) : ""} {entry.task}
        </div>
        <div className="mc-text-faint" style={{ fontSize: "11px" }}>
          {entry.source}
          {entry.schedule_human && <> {"\u00B7"} {entry.schedule_human}</>}
          {entry.model && <> {"\u00B7"} {entry.model}</>}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Status section */}
        <div>
          <McSectionTitle>Status</McSectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div style={statCardStyle}>
              <div className="mc-text-faint" style={statLabelStyle}>Current</div>
              <div className={STATUS_TEXT_CLASS[entry.status] || "mc-text-primary"} style={statValueStyle}>
                {entry.status.toUpperCase()}
              </div>
            </div>
            <div style={statCardStyle}>
              <div className="mc-text-faint" style={statLabelStyle}>Last Duration</div>
              <div className="mc-text-primary" style={statValueStyle}>
                {typeof entry.detail?.last_duration_ms === "number"
                  ? `${(entry.detail.last_duration_ms / 1000).toFixed(1)}s`
                  : "\u2014"}
              </div>
            </div>
            <div style={statCardStyle}>
              <div className="mc-text-faint" style={statLabelStyle}>Last Run</div>
              <div className="mc-text-primary" style={statValueStyle}>
                {entry.last_run_at
                  ? new Date(entry.last_run_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "\u2014"}
              </div>
              {entry.last_run_at && (
                <div className="mc-text-muted" style={statSubStyle}>{timeAgo(entry.last_run_at)}</div>
              )}
            </div>
            <div style={statCardStyle}>
              <div className="mc-text-faint" style={statLabelStyle}>Next Run</div>
              <div className="mc-text-primary" style={statValueStyle}>
                {entry.next_run_at
                  ? new Date(entry.next_run_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
                  : "\u2014"}
              </div>
              {entry.next_run_at && (
                <div className="mc-text-muted" style={statSubStyle}>{timeUntil(entry.next_run_at).text}</div>
              )}
            </div>
          </div>
        </div>

        {/* Config section — extra details */}
        {(entry.agent || entry.detail?.stdout_path || entry.detail?.stderr_path || entry.detail?.last_error || Number(entry.detail?.consecutive_errors ?? 0) > 0) && (
          <div>
            <McSectionTitle>Config</McSectionTitle>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "6rem 1fr",
                gap: "6px 12px",
                fontSize: "12px",
              }}
            >
              <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Source</span>
              <span className="mc-text-body">{entry.source}</span>

              <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Schedule</span>
              <span className="mc-text-body">{entry.schedule || entry.schedule_human}</span>

              {entry.agent && (
                <>
                  <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Agent</span>
                  <span className="mc-text-body">{agentEmoji(entry.agent)} {agentName(entry.agent)}</span>
                </>
              )}

              {typeof entry.detail?.stdout_path === "string" && (
                <>
                  <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Stdout</span>
                  <span className="mc-text-body" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={entry.detail.stdout_path}>{entry.detail.stdout_path}</span>
                </>
              )}

              {typeof entry.detail?.stderr_path === "string" && (
                <>
                  <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Stderr</span>
                  <span className="mc-text-body" style={{ overflow: "hidden", textOverflow: "ellipsis" }} title={entry.detail.stderr_path}>{entry.detail.stderr_path}</span>
                </>
              )}

              {typeof entry.detail?.last_error === "string" && (
                <>
                  <span className="mc-text-red" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Error</span>
                  <span className="mc-text-red">{entry.detail.last_error}</span>
                </>
              )}

              {typeof entry.detail?.consecutive_errors === "number" && entry.detail.consecutive_errors > 0 && (
                <>
                  <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px" }}>Errors</span>
                  <span className="mc-text-orange">{entry.detail.consecutive_errors} consecutive</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        {entry.activities && entry.activities.length > 0 && (
          <div>
            <McSectionTitle>Recent Activity</McSectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {entry.activities.map((act) => (
                <div
                  key={act.id}
                  style={{
                    ...statCardStyle,
                    display: "flex",
                    gap: "12px",
                    alignItems: "center",
                  }}
                >
                  <span className="mc-text-ghost" style={{ flexShrink: 0, fontSize: "11px", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {new Date(act.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="mc-text-muted" style={{ fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {act.title}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log tail */}
        {entry.log_tail && (
          <div>
            <McSectionTitle>Recent Logs</McSectionTitle>
            <pre className="mc-log-block" style={{ maxHeight: "200px", lineHeight: 1.7 }}>
              {entry.log_tail}
            </pre>
          </div>
        )}
      </div>
    </McPanel>
  );
}
