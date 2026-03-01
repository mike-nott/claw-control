/**
 * Agent IDs that represent operational/system agents — hidden from
 * user-facing dropdowns (assignee, reviewer, filter).
 *
 * Customise this list to match your agent setup. Ops agents typically
 * monitor systems and report — they don't get assigned tasks.
 */
export const OPS_AGENT_IDS: ReadonlySet<string> = new Set([
  // Add your ops agent IDs here, e.g.:
  // "monitor",
  // "security",
  // "health",
]);

/** Filter predicate for user-facing agent dropdowns. */
export function isUserAgent(agent: { id: string }): boolean {
  return !OPS_AGENT_IDS.has(agent.id);
}
