import { McPill } from "../mc";
import type { ActivityCardProps } from "./index";

export default function HealthDetailCard({ detail }: ActivityCardProps) {
  const p = detail.payload || {};
  const data = p.data || {};
  const message = p.message || detail.summary || "No details available";

  return (
    <div className="space-y-3">
      {/* Optional stats row */}
      {Object.keys(data).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.sleep_score != null && (
            <McPill variant="info" size="xs">{"\u{1F634}"} Sleep: {data.sleep_score}</McPill>
          )}
          {data.steps != null && (
            <McPill variant="success" size="xs">{"\u{1F45F}"} Steps: {data.steps.toLocaleString()}</McPill>
          )}
          {data.strain != null && (
            <McPill variant="warning" size="xs">{"\u{1F4AA}"} Strain: {data.strain}</McPill>
          )}
          {data.weight_kg != null && (
            <McPill variant="ghost" size="xs">{"\u2696\uFE0F"} {data.weight_kg}kg</McPill>
          )}
          {data.calories != null && (
            <McPill variant="error" size="xs">{"\u{1F525}"} {data.calories} cal</McPill>
          )}
          {data.recovery != null && (
            <McPill variant="success" size="xs">{"\u{1F49A}"} Recovery: {data.recovery}%</McPill>
          )}
        </div>
      )}
      {/* Full message */}
      <div className="text-sm whitespace-pre-wrap leading-relaxed mc-text-body">
        {message}
      </div>
    </div>
  );
}
