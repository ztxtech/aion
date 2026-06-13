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
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createRequirementsAnalystAgent = (model?: string): AgentConfig => ({
  description: "Task intake and requirements extraction. Searches denied. Translates user intent into a structured task contract with hidden-goal detection and dual-branch planning.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_DISPATCH_PROTOCOL,
    AION_REPORTBACK_PROTOCOL,
    AION_CORE_RULES,
    AION_AGENT_AUTONOMY_RULES,
    "",
    loadPrompt("requirements-analyst"),
    "",
    AION_TIME_SERIES_RULES,
  ].join("\n"),
  permission: {
    bash: "allow",
    edit: "deny",
    webfetch: "deny",
    doom_loop: "deny",
    external_directory: "allow",
  },
  tools: {
    task: false,
  },
})