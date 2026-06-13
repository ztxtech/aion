/**
 * Factory for the **information-collector** subagent.
 *
 * External-evidence specialist: websearch + webfetch + bash for SOTA /
 * literature / GitHub source-level discovery. Edit is denied — this agent
 * gathers, it never mutates deliverables. Adds the websearch and opencode
 * tooling rulesets on top of the base governance stack.
 */
import type { AgentConfig } from "@opencode-ai/sdk"
import {
  AION_GOVERNANCE_HEADER,
  AION_DISPATCH_PROTOCOL,
  AION_REPORTBACK_PROTOCOL,
} from "../prompts/governance"
import {
  AION_TIME_SERIES_RULES,
} from "../prompts/protocols"
import {
  AION_CORE_RULES,
  AION_AGENT_AUTONOMY_RULES,
  AION_WEBSEARCH_RULES,
  AION_OPENCODE_RULES,
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createInformationCollectorAgent = (model?: string): AgentConfig => ({
  description: "External evidence and SOTA search. Websearch + webfetch + bash allowed; edit denied. Multi-axis saturation, GitHub source-level search, dual-branch reverse-absorption.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_DISPATCH_PROTOCOL,
    AION_REPORTBACK_PROTOCOL,
    AION_CORE_RULES,
    AION_AGENT_AUTONOMY_RULES,
    AION_WEBSEARCH_RULES,
    AION_OPENCODE_RULES,
    "",
    loadPrompt("information-collector"),
    "",
    AION_TIME_SERIES_RULES,
  ].join("\n"),
  permission: {
    bash: "allow",
    edit: "deny",
    webfetch: "allow",
    doom_loop: "deny",
    external_directory: "allow",
  },
  tools: {
    task: false,
  },
})