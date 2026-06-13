// Agent prompt loader — inlines .md files at build time via Bun's text loader.
// Bun inlines each .md import as a string literal in the bundle, so the plugin
// no longer needs the source .md files on disk when deployed.

import aionDefault from "./agent-prompts/aion/default.md" with { type: "text" }
import cCriticDefault from "./agent-prompts/c-critic/default.md" with { type: "text" }
import coderDefault from "./agent-prompts/coder/default.md" with { type: "text" }
import informationCollectorDefault from "./agent-prompts/information-collector/default.md" with { type: "text" }
import requirementsAnalystDefault from "./agent-prompts/requirements-analyst/default.md" with { type: "text" }
import tsCriticDefault from "./agent-prompts/ts-critic/default.md" with { type: "text" }

const PROMPTS: Record<string, Record<string, string>> = {
  aion: { default: aionDefault },
  "c-critic": { default: cCriticDefault },
  coder: { default: coderDefault },
  "information-collector": { default: informationCollectorDefault },
  "requirements-analyst": { default: requirementsAnalystDefault },
  "ts-critic": { default: tsCriticDefault },
}

export function loadPrompt(agentName: string, variant: string = "default"): string {
  const agentTable = PROMPTS[agentName]
  if (!agentTable) {
    throw new Error(`[aion] Unknown agent: ${agentName}.`)
  }
  const text = agentTable[variant]
  if (text === undefined) {
    throw new Error(`[aion] Variant "${variant}" not found for agent "${agentName}".`)
  }
  return text
}
