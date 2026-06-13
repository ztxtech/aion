/**
 * Canonical list of the six AION agents and the derived name union type.
 *
 * The order is significant: it reflects the governance hierarchy from main
 * agent down to the final-gate critic. Keep in sync with agents/registry.ts.
 */
export const AION_AGENT_NAMES = [
  "aion",
  "requirements-analyst",
  "information-collector",
  "coder",
  "ts-critic",
  "c-critic",
] as const

export type AionAgentName = (typeof AION_AGENT_NAMES)[number]
