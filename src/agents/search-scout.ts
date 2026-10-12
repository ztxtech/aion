import type { AgentConfig } from "./agent-config"
import {
  AION_GOVERNANCE_HEADER,
  AION_REPORTBACK_PROTOCOL,
} from "../prompts/governance"
import { AION_WEBSEARCH_RULES } from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createSearchScoutAgent = (model?: string): AgentConfig => ({
  description: "Bounded retrieval child of information-collector. Executes one search axis and returns sourced evidence only.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_REPORTBACK_PROTOCOL,
    AION_WEBSEARCH_RULES,
    "",
    loadPrompt("search-scout"),
  ].join("\n"),
  permission: {
    external_directory: "allow",
    bash: "allow",
    edit: "deny",
    webfetch: "allow",
    doom_loop: "deny",
  },
  tools: {
    task: false,
  },
})
