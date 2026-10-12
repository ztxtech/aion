/**
 * Local agent configuration type.
 *
 * V2's `@opencode/schema/agent` uses Effect Schema branded types that are
 * too rigid for the plugin's agent registry. This local shape matches the
 * fields AION actually sets and is structurally compatible with V2's
 * agent config at runtime.
 */

export type AgentMode = "primary" | "subagent" | "all"

export type AgentPermission = Record<string, "allow" | "deny" | "ask">

export interface AgentConfig {
  description?: string
  mode?: AgentMode
  model?: string
  color?: string
  prompt?: string | string[]
  temperature?: number
  topP?: number
  options?: Record<string, unknown>
  permission?: AgentPermission
  [key: string]: unknown
}
