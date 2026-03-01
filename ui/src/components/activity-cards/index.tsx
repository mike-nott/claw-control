import type { ComponentType } from "react";
import type { ActivityLogEntry, ActivityLogEntryDetail } from "../../types";

import EscalationDetailCard from "./EscalationDetailCard";
import GenericDetailCard from "./GenericDetailCard";
import HealthDetailCard from "./HealthDetailCard";
import SecurityDetailCard from "./SecurityDetailCard";
import SystemHealthCard from "./SystemHealthCard";

export type ActivityCardProps = {
  detail: ActivityLogEntryDetail;
  entry: ActivityLogEntry;
};

/** Type-based cards take priority over agent-based cards. */
const typeRegistry: Record<string, ComponentType<ActivityCardProps>> = {
  escalation: EscalationDetailCard,
};

/** Agent-based cards (fallback). */
const cardRegistry: Record<string, ComponentType<ActivityCardProps>> = {
  security: SecurityDetailCard,
  system: SystemHealthCard,
  health: HealthDetailCard,
};

/** Payload checks — only use the agent-specific card if the data it needs is present. */
const payloadChecks: Record<string, (p: Record<string, unknown>) => boolean> = {
  security: (p) => !!(p.zone || p.camera || p.detection_type),
  system: (p) => !!(p.servers || p.services || p.issues),
  health: (p) => !!(p.data || p.message),
};

export function DetailCard({ agentId, detail, entry }: ActivityCardProps & { agentId: string | null }) {
  const TypeCard = entry.type ? typeRegistry[entry.type] : undefined;
  if (TypeCard) return <TypeCard detail={detail} entry={entry} />;

  if (agentId && cardRegistry[agentId]) {
    const payload = detail.payload || {};
    const check = payloadChecks[agentId];
    if (!check || check(payload)) {
      const Card = cardRegistry[agentId];
      return <Card detail={detail} entry={entry} />;
    }
  }

  return <GenericDetailCard detail={detail} entry={entry} />;
}
