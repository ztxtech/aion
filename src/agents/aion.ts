/**
 * Factory for the **AION main agent** (the `primary` mode orchestrator).
 *
 * Composes the full prompt stack: governance header → agent-specific prompt
 * → dispatch/reportback/stop-go/memory protocols → core + autonomy +
 * time-series rules. The main agent has the broadest permissions (bash,
 * edit, webfetch, question) and is the only agent allowed to use the
 * `question` tool for interactive-mode user checks.
 */
import type { AgentConfig } from "@opencode-ai/sdk"
import {
  AION_GOVERNANCE_HEADER,
  AION_DISPATCH_PROTOCOL,
  AION_REPORTBACK_PROTOCOL,
  AION_STOP_GO_PROTOCOL,
  AION_MEMORY_HIERARCHY,
} from "../prompts/governance"
import {
  AION_TIME_SERIES_RULES,
} from "../prompts/protocols"
import {
  AION_CORE_RULES,
  AION_AGENT_AUTONOMY_RULES,
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

// OpenCode SDK AgentConfig.permission type omits some keys (e.g. "question") that
// are valid at runtime. We extend it locally to allow the aion agent to opt in.
type AionPermission = NonNullable<AgentConfig["permission"]> & {
  question?: "ask" | "deny" | "allow"
}

export const createAionMainAgent = (model?: string): AgentConfig => ({
  description: "AION main agent: read the task, dispatch the right subagents, enforce review gates, and drive the flow to close.",
  mode: "primary",
  model,
  color: "primary",
  prompt: [
    AION_GOVERNANCE_HEADER,
    "",
    loadPrompt("aion"),
    "",
    AION_DISPATCH_PROTOCOL,
    AION_REPORTBACK_PROTOCOL,
    AION_STOP_GO_PROTOCOL,
    AION_MEMORY_HIERARCHY,
    "",
    AION_CORE_RULES,
    AION_AGENT_AUTONOMY_RULES,
    AION_TIME_SERIES_RULES,
  ].join("\n"),
  permission: {
    external_directory: "allow",
    bash: "allow",
    edit: "allow",
    webfetch: "allow",
    question: "allow",
    doom_loop: "deny",
  } as unknown as AionPermission,
})