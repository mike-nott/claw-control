import { McPanel, McPill } from "./mc";
import type { Agent, ScheduleEntry } from "../types";

type Props = {
  agents: Agent[];
  schedules: ScheduleEntry[];
};

type PillVariant = "success" | "info" | "ghost" | "error";

function statusVariant(status: string): PillVariant {
  switch (status) {
    case "active":
      return "success";
    case "idle":
      return "info";
    case "offline":
      return "ghost";
    case "error":
      return "error";
    default:
      return "ghost";
  }
}

export default function AgentCards({ agents, schedules }: Props) {
  const scheduleMap = new Map(schedules.filter((s) => s.agent).map((item) => [item.agent, item]));

  return (
    <McPanel>
      <div className="mc-section-label" style={{ marginBottom: "12px" }}>
        Agents
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {agents.map((agent) => {
          const schedule = scheduleMap.get(agent.id);
          return (
            <article
              key={agent.id}
              className="mc-rounded-inner mc-border mc-bg-2"
              style={{ padding: "12px" }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <p className="mc-text-body" style={{ fontWeight: 600, margin: 0 }}>{agent.name}</p>
                <McPill variant={statusVariant(agent.status)} size="xs">
                  {agent.status}
                </McPill>
              </div>
              <p className="mc-text-faint" style={{ fontSize: "12px", margin: 0 }}>{agent.kind}</p>
              <p className="mc-text-faint" style={{ fontSize: "12px", marginTop: "4px" }}>
                Last seen: {agent.last_seen_at ? new Date(agent.last_seen_at).toLocaleString() : "Never"}
              </p>
              {schedule && (
                <>
                  <p className="mc-text-faint" style={{ fontSize: "12px", marginTop: "4px" }}>
                    Schedule: {schedule.schedule_human}
                  </p>
                  <p className="mc-text-faint" style={{ fontSize: "12px" }}>
                    Last run: {schedule.last_run_at ? new Date(schedule.last_run_at).toLocaleString() : "n/a"}
                  </p>
                </>
              )}
            </article>
          );
        })}
        {!agents.length && (
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>No agents available.</p>
        )}
      </div>
    </McPanel>
  );
}
