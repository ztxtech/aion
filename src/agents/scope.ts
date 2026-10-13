import { AION_AGENT_NAMES } from "./names"

const AION_AGENT_IDS = new Set<string>(AION_AGENT_NAMES)

/**
 * Returns true only for agents owned by AION.
 *
 * Native OpenCode agents such as build and plan must keep their stock
 * prompt, tools, permissions, and execution hooks.
 */
export function isAionAgent(agent: string | null | undefined): boolean {
  return typeof agent === "string" && AION_AGENT_IDS.has(agent)
}
