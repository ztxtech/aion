import type { AgentConfig } from "@opencode-ai/sdk"
import type { AionAgentName } from "./names"
import { createAionMainAgent } from "./aion"
import { createRequirementsAnalystAgent } from "./requirements-analyst"
import { createInformationCollectorAgent } from "./information-collector"
import { createCoderAgent } from "./coder"
import { createTsCriticAgent } from "./ts-critic"
import { createCCriticAgent } from "./c-critic"

export type AionAgentModelMap = Partial<Record<AionAgentName, string>>

export const AION_AGENT_DESCRIPTIONS: Record<AionAgentName, string> = {
  "aion": "AION main agent: read the task, dispatch the right subagents, enforce review gates, and drive the flow to close.",
  "requirements-analyst": "Task intake and requirements extraction. Searches denied. Translates user intent into a structured task contract with hidden-goal detection and dual-branch planning.",
  "information-collector": "External evidence and SOTA search. Websearch + webfetch + bash allowed; edit denied. Multi-axis saturation, GitHub source-level search, dual-branch reverse-absorption.",
  "coder": "Finish the needed interfaces, analysis, experiments, and deliverables with real evidence. Visual + statistical + SHAP/feature attribution + drift analysis. ztxexp-mandated.",
  "ts-critic": "Time-series expert + Pareto stop-go governor. Leakage detection, metric validity, method-family coverage, stop-go verdicts. Edit denied.",
  "c-critic": "Final gate under minimal context. Highest authority. Stranger-view cold-start review of real artifacts. Visual analysis mandatory. Approve-stop or reject-stop verdict.",
}

export function buildAionAgents(_modelMap: AionAgentModelMap): Record<string, AgentConfig> {
  return {
    aion: createAionMainAgent(),
    "requirements-analyst": createRequirementsAnalystAgent(),
    "information-collector": createInformationCollectorAgent(),
    coder: createCoderAgent(),
    "ts-critic": createTsCriticAgent(),
    "c-critic": createCCriticAgent(),
  }
}
