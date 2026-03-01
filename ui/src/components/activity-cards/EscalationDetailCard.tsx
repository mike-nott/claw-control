import { McPill } from "../mc";
import type { ActivityCardProps } from "./index";

export default function EscalationDetailCard({ detail, entry }: ActivityCardProps) {
  const p = detail.payload;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{"\u{1F6A8}"}</span>
        <McPill variant="error" size="xs">
          {entry.priority.toUpperCase()}
        </McPill>
        <span className="text-sm font-semibold">{detail.title}</span>
      </div>
      {detail.summary && (
        <p className="text-sm mc-text-body">{detail.summary}</p>
      )}
      {p && Object.keys(p).length > 0 && (
        <div className="space-y-1">
          {Object.entries(p)
            .filter(([key]) => key !== "escalation_id")
            .map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="font-medium shrink-0 mc-text-muted">{key}:</span>
                <span className="break-all mc-text-body">
                  {typeof value === "object" ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs mc-text-faint">
        {p?.escalation_id && <span>ID: {String(p.escalation_id).slice(0, 8)}</span>}
        {entry.agent_id && <span>Agent: {entry.agent_id}</span>}
        {entry.source && <span>Source: {entry.source}</span>}
        <span>{new Date(entry.created_at).toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}
