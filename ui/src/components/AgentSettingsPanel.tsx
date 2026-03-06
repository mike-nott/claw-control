import type { AgentConfig } from "../types";
import { friendlyModelName } from "../utils/modelNames";

interface SelectedBox {
  section: string;
  key: string;
}

interface Props {
  agent: AgentConfig;
  selectedBox: SelectedBox | null;
  fileCache: Record<string, { content: string | null; exists: boolean }>;
  onSelectBox: (box: SelectedBox) => void;
}

const WORKSPACE_FILES = ["SOUL.md", "AGENTS.md", "IDENTITY.md", "TOOLS.md", "HEARTBEAT.md", "USER.md"];

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.8px",
  marginBottom: "4px",
  marginTop: "12px",
  gridColumn: "1 / -1",
};

function Box({
  label,
  preview,
  isActive,
  isMuted,
  onClick,
}: {
  label: string;
  preview: string;
  isActive: boolean;
  isMuted?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="mc-rounded-inner"
      style={{
        padding: "12px",
        border: isActive
          ? "1px solid var(--mc-indigo)"
          : "1px solid var(--mc-border)",
        background: isActive
          ? "var(--mc-indigo)"
          : "var(--mc-surface-1)",
        cursor: onClick ? "pointer" : "default",
        opacity: isMuted && !isActive ? 0.5 : 1,
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isActive && !isMuted && onClick) {
          e.currentTarget.style.background = "var(--mc-surface-2)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = "var(--mc-surface-1)";
        }
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: "13px",
          color: isActive ? "var(--mc-indigo-glow)" : "var(--mc-text-body)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "11px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginTop: "2px",
          color: isActive ? "rgba(224, 231, 255, 0.7)" : "var(--mc-text-faint)",
        }}
      >
        {preview}
      </div>
    </div>
  );
}

function isBoxActive(selectedBox: SelectedBox | null, section: string, key: string) {
  return selectedBox?.section === section && selectedBox?.key === key;
}

export default function AgentSettingsPanel({ agent, selectedBox, fileCache, onSelectBox }: Props) {
  const shortModel = friendlyModelName(agent.model?.primary ?? "anthropic/claude-opus-4-6");

  const firstFallback = agent.model?.fallbacks?.[0]
    ? friendlyModelName(agent.model.fallbacks[0])
    : null;

  // Tools preview
  let toolsPreview: string;
  if (agent.tools == null) {
    toolsPreview = "All tools (no restrictions)";
  } else if (agent.tools.length === 0) {
    toolsPreview = "None";
  } else {
    const first3 = agent.tools.slice(0, 3).join(", ");
    const extra = agent.tools.length > 3 ? ` +${agent.tools.length - 3} more` : "";
    toolsPreview = first3 + extra;
  }

  // Access counts
  const memoryCount = Object.values(agent.access?.memory ?? {}).filter((v) => v != null).length;
  const storeCount = Object.values(agent.access?.data_stores ?? {}).filter((v) => v != null).length;
  const toolCount = Object.values(agent.access?.tools ?? {}).filter((v) => v != null).length;
  const extToolCount = Object.values(agent.access?.external_tools ?? {}).filter((v) => v != null).length;

  const hasFallbacks = (agent.model?.fallbacks?.length ?? 0) > 0;

  return (
    <div style={{ overflow: "auto", height: "100%", paddingRight: "4px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>

        {/* Identity */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"👤"} Identity</div>
        <Box
          label="Team"
          preview={agent.team}
          isActive={isBoxActive(selectedBox, "identity", "team")}
          onClick={() => onSelectBox({ section: "identity", key: "team" })}
        />
        <Box
          label="Bio"
          preview={agent.title || agent.bio}
          isActive={isBoxActive(selectedBox, "identity", "bio")}
          onClick={() => onSelectBox({ section: "identity", key: "bio" })}
        />

        {/* Model */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"🧠"} Model</div>
        {hasFallbacks ? (
          <>
            <Box
              label="Primary Model"
              preview={shortModel}
              isActive={isBoxActive(selectedBox, "model", "primary")}
              onClick={() => onSelectBox({ section: "model", key: "primary" })}
            />
            <Box
              label="Fallbacks"
              preview={firstFallback ?? "none"}
              isActive={isBoxActive(selectedBox, "model", "fallbacks")}
              onClick={() => onSelectBox({ section: "model", key: "fallbacks" })}
            />
          </>
        ) : (
          <div style={{ gridColumn: "1 / -1" }}>
            <Box
              label="Primary Model"
              preview={shortModel}
              isActive={isBoxActive(selectedBox, "model", "primary")}
              onClick={() => onSelectBox({ section: "model", key: "primary" })}
            />
          </div>
        )}

        {/* Workspace Files */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"📄"} Workspace Files</div>
        {!agent.workspace ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Box label="No dedicated workspace" preview="\u2014" isActive={false} isMuted />
          </div>
        ) : (
          WORKSPACE_FILES.map((filename) => {
            const cacheKey = agent.id + "/" + filename;
            const cached = fileCache[cacheKey];
            let preview = "Click to load";
            let isMuted = false;
            if (cached) {
              if (!cached.exists) {
                preview = "(not present)";
                isMuted = true;
              } else {
                const firstLine = cached.content
                  ?.split("\n")
                  .find((l) => l.trim().length > 0) ?? "";
                preview = firstLine || "(empty)";
              }
            }
            return (
              <Box
                key={filename}
                label={filename}
                preview={preview}
                isActive={isBoxActive(selectedBox, "workspace", filename)}
                isMuted={isMuted}
                onClick={() => onSelectBox({ section: "workspace", key: filename })}
              />
            );
          })
        )}

        {/* Access \u2014 Memory + Data Stores */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"🔐"} Access</div>
        <Box
          label="Memory Access"
          preview={memoryCount > 0 ? `${memoryCount} resource${memoryCount !== 1 ? "s" : ""}` : "No access"}
          isActive={isBoxActive(selectedBox, "access", "memory")}
          onClick={() => onSelectBox({ section: "access", key: "memory" })}
        />
        <Box
          label="Data Store Access"
          preview={storeCount > 0 ? `${storeCount} store${storeCount !== 1 ? "s" : ""}` : "No access"}
          isActive={isBoxActive(selectedBox, "access", "data_stores")}
          onClick={() => onSelectBox({ section: "access", key: "data_stores" })}
        />

        {/* Tools + Integrations */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"🔧"} Tools</div>
        <Box
          label="Agent Tools"
          preview={toolsPreview}
          isActive={isBoxActive(selectedBox, "tools", "allowed")}
          onClick={() => onSelectBox({ section: "tools", key: "allowed" })}
        />
        <Box
          label="Integrations"
          preview={toolCount > 0 ? `${toolCount} tool${toolCount !== 1 ? "s" : ""}` : "No access"}
          isActive={isBoxActive(selectedBox, "access", "tools")}
          onClick={() => onSelectBox({ section: "access", key: "tools" })}
        />
        {extToolCount > 0 && (
          <div style={{ gridColumn: "1 / -1" }}>
            <Box
              label="External Tools"
              preview={`${extToolCount} tool${extToolCount !== 1 ? "s" : ""} installed`}
              isActive={isBoxActive(selectedBox, "access", "external_tools")}
              onClick={() => onSelectBox({ section: "access", key: "external_tools" })}
            />
          </div>
        )}

        {/* Skills */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"⚡"} Skills</div>
        <div style={{ gridColumn: "1 / -1" }}>
          <Box
            label="Skills"
            preview={
              (agent.skills?.length ?? 0) > 0
                ? `${agent.skills.length} skill${agent.skills.length !== 1 ? "s" : ""} assigned`
                : "None assigned"
            }
            isActive={isBoxActive(selectedBox, "skills", "skills")}
            isMuted={(agent.skills?.length ?? 0) === 0}
            onClick={() => onSelectBox({ section: "skills", key: "skills" })}
          />
        </div>

        {/* Schedule */}
        <div className="mc-text-faint" style={sectionHeadingStyle}>{"⏰"} Schedule</div>
        {agent.heartbeat ? (
          <Box
            label="Heartbeat"
            preview={`Every ${agent.heartbeat.every ?? "\u2014"}`}
            isActive={isBoxActive(selectedBox, "heartbeat", "config")}
            onClick={() => onSelectBox({ section: "heartbeat", key: "config" })}
          />
        ) : null}
        {agent.cron_jobs.length === 0 && !agent.heartbeat ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Box label="No scheduled jobs" preview="\u2014" isActive={false} isMuted />
          </div>
        ) : agent.cron_jobs.length === 1 ? (
          <div style={{ gridColumn: "1 / -1" }}>
            <Box
              label={agent.cron_jobs[0].name}
              preview={`${agent.cron_jobs[0].schedule_expr ?? "\u2014"} \u00B7 ${agent.cron_jobs[0].enabled ? "\u2705" : "\u23F8\uFE0F"}`}
              isActive={isBoxActive(selectedBox, "schedule", agent.cron_jobs[0].id)}
              onClick={() => onSelectBox({ section: "schedule", key: agent.cron_jobs[0].id })}
            />
          </div>
        ) : (
          agent.cron_jobs.map((job) => (
            <Box
              key={job.id}
              label={job.name}
              preview={`${job.schedule_expr ?? "\u2014"} \u00B7 ${job.enabled ? "\u2705" : "\u23F8\uFE0F"}`}
              isActive={isBoxActive(selectedBox, "schedule", job.id)}
              onClick={() => onSelectBox({ section: "schedule", key: job.id })}
            />
          ))
        )}

      </div>
    </div>
  );
}
