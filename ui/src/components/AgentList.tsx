import { McPanel } from "./mc";
import type { AgentConfig } from "../types";

interface Props {
  agents: AgentConfig[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function AgentList({ agents, selectedId, onSelect }: Props) {
  let lastTeam = "";
  return (
    <McPanel padding="none" className="overflow-auto">
      {agents.map((agent) => {
        const isActive = agent.id === selectedId;
        const showHeader = agent.team !== lastTeam;
        lastTeam = agent.team;
        return (
          <div key={agent.id}>
            {showHeader && (
              <div
                className="mc-text-ghost"
                style={{
                  padding: "12px 12px 4px",
                  fontSize: "11px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.8px",
                }}
              >
                {agent.team}
              </div>
            )}
            <div
              className="mc-rounded-inner"
              onClick={() => onSelect(agent.id)}
              style={{
                padding: "12px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: isActive ? "var(--mc-indigo)" : "transparent",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--mc-surface-2)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span style={{ fontSize: "20px", lineHeight: 1 }}>{agent.emoji ?? "\u{1F916}"}</span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: "13px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isActive ? "var(--mc-indigo-glow)" : "var(--mc-text-body)",
                  }}
                >
                  {agent.name}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: isActive ? "rgba(224, 231, 255, 0.7)" : "var(--mc-text-faint)",
                  }}
                >
                  {agent.id}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </McPanel>
  );
}
