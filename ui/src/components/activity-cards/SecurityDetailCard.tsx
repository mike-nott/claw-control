import { McPill } from "../mc";
import type { ActivityCardProps } from "./index";

// Zone display names — customise to match your camera zones.
// Keys should match the zone IDs sent by your security processor.
// If a zone is not listed here, the raw zone ID is shown instead.
const ZONE_NAMES: Record<string, string> = {
  // front: "Front Entrance",
  // back: "Back Garden",
  // garage: "Garage",
};

type SeverityVariant = "ghost" | "warning" | "error";

const SEVERITY_VARIANT: Record<string, SeverityVariant> = {
  none: "ghost",
  low: "warning",
  medium: "error",
  high: "error",
};

const DETECTION_ICONS: Record<string, string> = {
  vehicle: "\u{1F697}",
  person: "\u{1F464}",
  animal: "\u{1F43E}",
  package: "\u{1F4E6}",
};

export default function SecurityDetailCard({ detail }: ActivityCardProps) {
  const p = detail.payload;
  const analysis = p.analysis || {};
  const vehicle = analysis.vehicle_details;
  const thumbnailUrl = p.thumbnail ? `/api/activity/media/${p.thumbnail}` : null;

  return (
    <div className="flex gap-4">
      {thumbnailUrl && (
        <div className="shrink-0">
          <img
            src={thumbnailUrl}
            alt="Detection thumbnail"
            className="w-80 h-auto rounded-lg object-cover mc-border"
          />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>{"\u{1F4CD}"} <strong>{ZONE_NAMES[p.zone] || p.zone || "Unknown"}</strong></span>
          <span className="mc-text-muted">{"\u2022"}</span>
          <span>{"\u{1F4F7}"} {p.camera || "Unknown"}</span>
        </div>
        <div>
          <span className="font-medium">
            {DETECTION_ICONS[p.detection_type] || "\u{1F4F9}"}{" "}
            {p.detection_type
              ? p.detection_type.charAt(0).toUpperCase() + p.detection_type.slice(1)
              : "Detection"}
          </span>
          {p.severity && (
            <McPill variant={SEVERITY_VARIANT[p.severity] || "ghost"} size="xs" className="ml-2">
              {p.severity.toUpperCase()}
            </McPill>
          )}
        </div>
        {analysis.description && (
          <p className="text-sm mc-text-body">{analysis.description}</p>
        )}
        {vehicle && (vehicle.color || vehicle.type || vehicle.license_plate) && (
          <div className="text-xs space-y-0.5 mc-text-muted">
            {vehicle.color && <div>Color: {vehicle.color}</div>}
            {vehicle.type && <div>Type: {vehicle.type}</div>}
            {vehicle.make_model && vehicle.make_model !== "not identifiable" && (
              <div>Make: {vehicle.make_model}</div>
            )}
            {vehicle.license_plate && vehicle.license_plate !== "not visible" && (
              <div>{"\u{1F522}"} Plate: <strong>{vehicle.license_plate}</strong></div>
            )}
          </div>
        )}
        {analysis.person_details && (
          <p className="text-xs mc-text-muted">{"\u{1F464}"} {analysis.person_details}</p>
        )}
        {analysis.related_to_recent && (
          <p className="text-xs font-medium mc-text-blue">{"\u{1F517}"} {analysis.related_to_recent}</p>
        )}
        <div className="flex flex-wrap gap-3 text-xs mc-text-faint">
          {p.people_home?.length > 0 && (
            <span>{"\u{1F3E0}"} Home: {p.people_home.join(", ")}</span>
          )}
          {p.alarm_status && (
            <span>{p.alarm_status.includes("armed") ? "\u{1F512}" : "\u{1F513}"} {p.alarm_status}</span>
          )}
          {p.decision_reason && (
            <span>{"\u26A0\uFE0F"} {p.decision_reason}</span>
          )}
        </div>
      </div>
    </div>
  );
}
