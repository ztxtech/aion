import type { AgentConfig } from "@opencode-ai/sdk"
import {
  AION_GOVERNANCE_HEADER,
  AION_REPORTBACK_PROTOCOL,
  AION_STOP_GO_PROTOCOL,
} from "../prompts/governance"
import {
  AION_TIME_SERIES_RULES,
  AION_DISPATCH_PROTOCOL,
} from "../prompts/protocols"
import {
  AION_CORE_RULES,
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createCCriticAgent = (model?: string): AgentConfig => ({
  description: "Final gate under minimal context. Highest authority. Stranger-view cold-start review of real artifacts. Visual analysis mandatory. Approve-stop or reject-stop verdict.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_REPORTBACK_PROTOCOL,
    AION_STOP_GO_PROTOCOL,
    AION_CORE_RULES,
    AION_TIME_SERIES_RULES,
    "",
    loadPrompt("c-critic"),
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