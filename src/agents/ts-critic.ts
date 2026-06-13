/**
 * Factory for the **ts-critic** subagent.
 *
 * Time-series domain expert and Pareto stop-go governor. Reviews for
 * leakage, metric validity, and method-family coverage, then issues a
 * stop-go verdict. Edit/webfetch denied — the critic advises, it does not
 * implement.
 */
import type { AgentConfig } from "@opencode-ai/sdk"
import {
  AION_GOVERNANCE_HEADER,
  AION_DISPATCH_PROTOCOL,
  AION_REPORTBACK_PROTOCOL,
  AION_STOP_GO_PROTOCOL,
} from "../prompts/governance"
import {
  AION_TIME_SERIES_RULES,
} from "../prompts/protocols"
import {
  AION_CORE_RULES,
  AION_EXPERIMENT_RULES,
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createTsCriticAgent = (model?: string): AgentConfig => ({
  description: "Time-series expert + Pareto stop-go governor. Leakage detection, metric validity, method-family coverage, stop-go verdicts. Edit denied.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_DISPATCH_PROTOCOL,
    AION_REPORTBACK_PROTOCOL,
    AION_STOP_GO_PROTOCOL,
    AION_CORE_RULES,
    AION_TIME_SERIES_RULES,
    AION_EXPERIMENT_RULES,
    "",
    loadPrompt("ts-critic"),
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