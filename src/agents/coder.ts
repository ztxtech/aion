/**
 * Factory for the **coder** subagent.
 *
 * The implementation workhorse: full bash/edit/webfetch access. Mandated
 * to run experiments through the ztxexp boundary and to produce visual +
 * statistical + SHAP evidence. Adds the experiment ruleset on top of the
 * base governance stack.
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
  AION_EXPERIMENT_RULES,
} from "../prompts/rules"
import { loadPrompt } from "../prompts/load-prompt"

export const createCoderAgent = (model?: string): AgentConfig => ({
  description: "Finish the needed interfaces, analysis, experiments, and deliverables with real evidence. Visual + statistical + SHAP/feature attribution + drift analysis. ztxexp-mandated.",
  mode: "subagent",
  model,
  prompt: [
    AION_GOVERNANCE_HEADER,
    AION_DISPATCH_PROTOCOL,
    AION_REPORTBACK_PROTOCOL,
    AION_CORE_RULES,
    AION_AGENT_AUTONOMY_RULES,
    AION_EXPERIMENT_RULES,
    AION_TIME_SERIES_RULES,
    "",
    loadPrompt("coder"),
  ].join("\n"),
  permission: {
    external_directory: "allow",
    bash: "allow",
    edit: "allow",
    webfetch: "allow",
    doom_loop: "deny",
  },
  tools: {
    task: false,
  },
})