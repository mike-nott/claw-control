import { useCallback, useEffect, useState } from "react";

import { getActivityDetail, getActivityLog, getActivityLogFilters, getAgents } from "../api";
import { DetailCard } from "../components/activity-cards";
import CreateTaskModal from "../components/CreateTaskModal";
import { McButton, McFilterBar, McPanel, McPill, McSelect } from "../components/mc";
import { connectStream } from "../sse";
import type { ActivityLogEntry, ActivityLogEntryDetail, ActivityLogFilters, Agent, StreamEvent } from "../types";

const PAGE_SIZE = 100;

type PillVariant = "ghost" | "warning" | "error";

const PRIORITY_VARIANT: Record<string, PillVariant> = {
  low: "ghost",
  medium: "warning",
  high: "error",
  urgent: "error",
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

type CreateModalPrefill = {
  title: string;
  priority: string;
  assigneeAgentId: string | null;
  sourceActivityId: string;
  sourceActivityTitle: string;
  sourceActivityAgentId: string | null;
  sourceActivityTime: string;
};

const TIME_RANGES = [
  { key: "all", label: "All" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

export default function ActivityPage() {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [, setFilters] = useState<ActivityLogFilters>({ types: [], sources: [] });
  const [activePriority, setActivePriority] = useState<string>("");
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("");
  const [filterRange, setFilterRange] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [detailCache, setDetailCache] = useState<Record<string, ActivityLogEntryDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [createModalPrefill, setCreateModalPrefill] = useState<CreateModalPrefill | null>(null);

  // Fetch agents once on mount
  useEffect(() => {
    void getAgents().then(setAgents).catch(() => {});
  }, []);

  const agentEmoji = useCallback((agentId: string | null): string => {
    if (!agentId) return "\u{1F4CB}";
    return agents.find((a) => a.id === agentId)?.emoji || "\u{1F4CB}";
  }, [agents]);

  const agentName = useCallback((agentId: string | null): string => {
    if (!agentId) return "unknown";
    return agents.find((a) => a.id === agentId)?.name || agentId;
  }, [agents]);

  const buildParams = useCallback((cursor?: string): Record<string, string> => {
    const params: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (activePriority) params.priority = activePriority;
    if (filterAgent) params.agent_id = filterAgent;
    if (filterType) params.type = filterType;
    if (filterRange !== "all") {
      const now = Date.now();
      const rangeMs: Record<string, number> = {
        "1h": 60 * 60 * 1000,
        "24h": 24 * 60 * 60 * 1000,
        "7d": 7 * 24 * 60 * 60 * 1000,
        "30d": 30 * 24 * 60 * 60 * 1000,
      };
      if (rangeMs[filterRange]) {
        params.since = new Date(now - rangeMs[filterRange]).toISOString();
      }
    }
    if (cursor) params.cursor = cursor;
    return params;
  }, [activePriority, filterAgent, filterType, filterRange]);

  // Initial load + filter change
  const fetchData = useCallback(async () => {
    setLoading(true);
    setHasMore(true);
    const [logData, filterData] = await Promise.all([
      getActivityLog(buildParams()),
      getActivityLogFilters(),
    ]);
    setEntries(logData);
    setFilters(filterData);
    setHasMore(logData.length >= PAGE_SIZE);
    setLoading(false);
  }, [buildParams]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Load more (next page)
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || entries.length === 0) return;
    setLoadingMore(true);
    const lastEntry = entries[entries.length - 1];
    const data = await getActivityLog(buildParams(lastEntry.created_at));
    setEntries((prev) => [...prev, ...data]);
    setHasMore(data.length >= PAGE_SIZE);
    setLoadingMore(false);
  }, [hasMore, loadingMore, entries, buildParams]);

  // SSE for live updates (prepend to top)
  useEffect(() => {
    return connectStream({
      onEvent: (event: StreamEvent) => {
        if (event.type === "activity_log.created") {
          const entry = event.payload as unknown as ActivityLogEntry;
          if (entry?.id) {
            setEntries((prev) => [entry, ...prev]);
          }
        }
      },
      onError: () => {},
    });
  }, []);

  const handleCreateFromActivity = (entry: ActivityLogEntry) => {
    setCreateModalPrefill({
      title: entry.title,
      priority: entry.priority,
      assigneeAgentId: entry.agent_id,
      sourceActivityId: entry.id,
      sourceActivityTitle: entry.title,
      sourceActivityAgentId: entry.agent_id,
      sourceActivityTime: entry.created_at,
    });
  };

  const handleExpand = async (entry: ActivityLogEntry) => {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    if (!detailCache[entry.id]) {
      setDetailLoading(entry.id);
      try {
        const detail = await getActivityDetail(entry.id);
        setDetailCache((prev) => ({ ...prev, [entry.id]: detail }));
      } finally {
        setDetailLoading(null);
      }
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Filter bar */}
      <McFilterBar>
        <McSelect value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </McSelect>

        <McSelect value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          <option value="escalation">Escalation</option>
        </McSelect>

        <McSelect value={activePriority} onChange={(e) => setActivePriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </McSelect>

        <div style={{ display: "flex", gap: "4px" }}>
          {TIME_RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilterRange(item.key)}
              className={`mc-tab-pill-bordered ${filterRange === item.key ? "active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </McFilterBar>

      {/* Activity list */}
      <McPanel padding="none">
        {loading ? (
          <div className="mc-text-muted" style={{ padding: "24px", fontSize: "13px" }}>
            Loading activity...
          </div>
        ) : entries.length === 0 ? (
          <div className="mc-text-muted" style={{ padding: "24px", fontSize: "13px" }}>
            No activity matching filters.
          </div>
        ) : (
          <div>
            {entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              const isEscalation = entry.type === "escalation";
              const rowBg = isExpanded
                ? "rgba(99, 102, 241, 0.08)"
                : isEscalation
                  ? "rgba(248, 113, 113, 0.04)"
                  : "transparent";

              return (
                <div key={entry.id}>
                  {/* Activity row */}
                  <button
                    type="button"
                    onClick={() => void handleExpand(entry)}
                    style={{
                      display: "flex",
                      width: "100%",
                      alignItems: "center",
                      gap: "12px",
                      padding: "10px 16px",
                      textAlign: "left",
                      background: rowBg,
                      cursor: "pointer",
                      transition: "background 0.1s",
                      color: "inherit",
                      font: "inherit",
                      outline: "none",
                      borderTop: "none",
                      borderRight: "none",
                      borderBottom: "1px solid var(--mc-border-row)",
                      borderLeft: isEscalation
                        ? "3px solid var(--mc-red-light)"
                        : "3px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isExpanded && !isEscalation) {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = rowBg;
                    }}
                  >
                    <span className="mc-text-faint" style={{ width: "55px", flexShrink: 0, fontSize: "11px", fontVariantNumeric: "tabular-nums" }}>
                      {formatTime(entry.created_at)}
                    </span>
                    <span className="mc-text-muted" style={{ width: "100px", flexShrink: 0, fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {agentEmoji(entry.agent_id)} {agentName(entry.agent_id)}
                    </span>
                    <span style={{ width: "70px", flexShrink: 0, display: "flex", justifyContent: "center" }}>
                      <McPill variant={PRIORITY_VARIANT[entry.priority] || "ghost"} size="xs">
                        {entry.priority}
                      </McPill>
                    </span>
                    <span className="mc-text-body" style={{ flex: 1, minWidth: 0, fontSize: "13px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {isEscalation && <span style={{ marginRight: "4px" }}>{"\u{1F6A8}"}</span>}
                      {entry.title}
                    </span>
                    <span className="mc-text-ghost" style={{ width: "70px", flexShrink: 0, textAlign: "right", fontSize: "11px" }}>
                      {timeAgo(entry.created_at)}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div
                      style={{
                        padding: "12px 16px",
                        background: "rgba(0, 0, 0, 0.15)",
                        borderTop: "1px solid var(--mc-border-row)",
                      }}
                    >
                      {detailLoading === entry.id ? (
                        <div className="mc-text-muted" style={{ fontSize: "13px" }}>
                          Loading...
                        </div>
                      ) : detailCache[entry.id] ? (
                        <div style={{ display: "flex", gap: "16px" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <DetailCard agentId={entry.agent_id} detail={detailCache[entry.id]} entry={entry} />
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            <McButton
                              variant="outline"
                              size="xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateFromActivity(entry);
                              }}
                            >
                              {"\u2192"} Create Task
                            </McButton>
                          </div>
                        </div>
                      ) : (
                        <p className="mc-text-muted" style={{ fontSize: "13px" }}>
                          Failed to load details
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {!loading && hasMore && (
          <div
            style={{
              padding: "12px",
              textAlign: "center",
              borderTop: "1px solid var(--mc-border-row)",
            }}
          >
            <McButton
              variant="ghost"
              size="sm"
              onClick={() => void loadMore()}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading..." : "Load more"}
            </McButton>
          </div>
        )}
      </McPanel>

      {/* Create Task Modal */}
      <CreateTaskModal
        open={createModalPrefill !== null}
        onClose={() => setCreateModalPrefill(null)}
        onCreated={() => setCreateModalPrefill(null)}
        agents={agents}
        prefill={createModalPrefill}
      />
    </div>
  );
}
