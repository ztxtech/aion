import type { AgentConfig } from "./agent-config"
import {
  AION_GOVERNANCE_HEADER,
  AION_REPORTBACK_PROTOCOL,
} from "../prompts/governance"
import { AION_EXPERIMENT_RULES } from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createExperimentRunnerAgent = (model?: string): AgentConfig => ({
  description: "Bounded execution child of coder. Runs one prepared experiment package and preserves reproducible logs.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_REPORTBACK_PROTOCOL,
    AION_EXPERIMENT_RULES,
    "",
    loadPrompt("experiment-runner"),
  ].join("\n"),
  permission: {
    external_directory: "allow",
    bash: "allow",
    edit: "allow",
    webfetch: "deny",
    doom_loop: "deny",
  },
  tools: {
    task: false,
  },
})
