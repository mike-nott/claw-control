import { McPanel, McPill } from "./mc";
import { TASK_COLUMNS, groupTasksByStatus } from "../lib/status";
import type { Agent, Task } from "../types";

type PillVariant = "ghost" | "warning" | "error";

const PRIORITY_VARIANT: Record<string, PillVariant> = {
  low: "ghost",
  medium: "warning",
  high: "error",
  urgent: "error",
};

const PRIORITY_GRADIENTS: Record<string, string> = {
  low: "linear-gradient(90deg, #94a3b8, #64748b)",
  medium: "linear-gradient(90deg, #fb923c, #f97316)",
  high: "linear-gradient(90deg, #f87171, #ef4444)",
  urgent: "linear-gradient(90deg, #fca5a5, #f87171)",
};

const COLUMN_GRADIENTS: Record<string, string> = {
  inbox: "linear-gradient(90deg, #818cf8, #6366f1)",
  in_progress: "linear-gradient(90deg, #93c5fd, #3b82f6)",
  review: "linear-gradient(90deg, #fb923c, #f97316)",
  done: "linear-gradient(90deg, #4ade80, #22c55e)",
};

type Props = {
  tasks: Task[];
  agents: Agent[];
  activeTaskId: string | null;
  onSelectTask: (task: Task) => void;
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

export default function KanbanBoard({ tasks, agents, activeTaskId, onSelectTask }: Props) {
  const agentLabel = (id: string | null) => {
    if (!id) return "unassigned";
    const a = agents.find((a) => a.id === id);
    return a ? `${a.emoji || ""} ${a.name}`.trim() : id;
  };
  const grouped = groupTasksByStatus(tasks);

  return (
    <div style={{ display: "flex", gap: "12px", height: "100%" }}>
      {TASK_COLUMNS.map((column) => (
        <McPanel key={column.key} padding="none" className="flex-1 min-w-0 flex flex-col relative overflow-hidden">
          {/* Column gradient bar */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "3px",
              background: COLUMN_GRADIENTS[column.key] || "transparent",
            }}
          />
          {/* Column header */}
          <div
            className="mc-border-bottom"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 14px",
            }}
          >
            <span
              className="mc-text-muted"
              style={{
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "2px",
              }}
            >
              {column.label}
            </span>
            <span
              className="mc-text-ghost mc-rounded-pill"
              style={{
                fontSize: "10px",
                background: "rgba(255, 255, 255, 0.05)",
                padding: "2px 8px",
              }}
            >
              {grouped[column.key].length}
            </span>
          </div>

          {/* Cards */}
          <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "10px", flex: 1, overflowY: "auto" }}>
            {grouped[column.key].map((task) => {
              const isActive = activeTaskId === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className="mc-bg-2 mc-rounded-inner"
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: isActive ? "1px solid var(--mc-indigo)" : "1px solid var(--mc-border)",
                    padding: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: isActive ? "0 0 0 1px var(--mc-indigo)" : "none",
                    color: "inherit",
                    font: "inherit",
                    outline: "none",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.transform = "translateY(-1px)";
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "";
                    e.currentTarget.style.boxShadow = isActive ? "0 0 0 1px var(--mc-indigo)" : "none";
                  }}
                >
                  {/* Priority gradient bar */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "2px",
                      background: PRIORITY_GRADIENTS[task.priority] || "transparent",
                    }}
                  />

                  <p
                    className="line-clamp-2 mc-text-primary"
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      marginBottom: "6px",
                      lineHeight: 1.4,
                    }}
                  >
                    {task.title}
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center" }}>
                    <span className="mc-text-muted" style={{ fontSize: "11px" }}>
                      {agentLabel(task.assignee_agent_id)}
                    </span>
                    <McPill variant={PRIORITY_VARIANT[task.priority] || "ghost"} size="xs">
                      {task.priority}
                    </McPill>
                    <span className="mc-text-ghost" style={{ fontSize: "10px", textAlign: "right" }}>
                      {timeAgo(task.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
            {grouped[column.key].length === 0 && (
              <p className="mc-text-ghost" style={{ padding: "20px", textAlign: "center", fontSize: "12px" }}>
                No tasks
              </p>
            )}
          </div>
        </McPanel>
      ))}
    </div>
  );
}
