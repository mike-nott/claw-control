import type { ActivityCardProps } from "./index";

export default function GenericDetailCard({ detail, entry }: ActivityCardProps) {
  const p = detail.payload;
  const hasPayload = p && Object.keys(p).length > 0;

  return (
    <div className="space-y-3">
      {detail.summary && (
        <p className="text-sm mc-text-body">{detail.summary}</p>
      )}
      {hasPayload && (
        <div className="space-y-1">
          {Object.entries(p).map(([key, value]) => (
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
        <span>Source: {entry.source}</span>
        {entry.agent_id && <span>Agent: {entry.agent_id}</span>}
        <span>{new Date(entry.created_at).toLocaleString("en-GB")}</span>
      </div>
    </div>
  );
}
