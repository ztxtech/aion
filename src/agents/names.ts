export const AION_AGENT_NAMES = [
  "aion",
  "requirements-analyst",
  "information-collector",
  "coder",
  "ts-critic",
  "c-critic",
] as const

export type AionAgentName = (typeof AION_AGENT_NAMES)[number]
