/**
 * `tool.definition` hook — dynamic tool-description enrichment.
 *
 * Appends phase-aware hints to tool descriptions at request time so the LLM
 * sees contextual guidance:
 *   - `aion_critic_dispatch` / `aion_critic_verdict`: which critic to call
 *     and what verdict means in the current phase.
 *   - `aion_workspace_init`: flagged as REQUIRED during the init phase.
 *   - `question`: in interactive mode after c-critic approve-stop, the
 *     description is rewritten to instruct the agent to ask the user
 *     whether to continue or finalize.
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionToolDefinitionHook } from "./types"
import type { AionPhase } from "../create-managers"
import { info } from "../shared/logger"

const PHASE_DESCRIPTION_SUFFIX: Partial<Record<string, string>> = {
  "aion_workspace_init": " [REQUIRED NOW — you are in the init phase]",
  "aion_critic_dispatch": " [Dispatch a critic for review]",
  "aion_critic_verdict": " [Record a critic verdict to advance the phase loop]",
  "aion_pre_stop_gate": " [Check stop gate before final review]",
}

const CRITIC_DISPATCH_PHASE_HINTS: Record<AionPhase, string> = {
  init: " Not available in init phase.",
  gather: " Dispatch ts-critic for pre-implementation review.",
  "ts-pre-review": " ts-critic is currently reviewing. Wait for verdict.",
  implement: " Dispatch ts-critic for post-implementation review.",
  "ts-post-review": " ts-critic is currently reviewing. Wait for verdict.",
  "c-critic-final": " Dispatch c-critic for final cold-start review.",
  "loop-back": " Restart from requirements gathering first.",
  done: " Task is complete. No dispatch needed.",
}

const VERDICT_PHASE_HINTS: Record<AionPhase, string> = {
  init: " Not available in init phase.",
  gather: " Dispatch a critic first.",
  "ts-pre-review": " Record ts-critic verdict (allow-stop to proceed, block to go back).",
  implement: " Continue implementing or dispatch ts-critic for post-review.",
  "ts-post-review": " Record ts-critic verdict (allow-stop to proceed to final gate, block to re-implement).",
  "c-critic-final": " Record c-critic verdict (approve-stop to finish, reject-stop to loop back).",
  "loop-back": " Must re-gather requirements first.",
  done: " Task complete. No verdict needed.",
}

export function createToolDefinitionHook(args: CreateHooksArgs): AionToolDefinitionHook {
  const { managers } = args

  return async function toolDefinition(input, output) {
    const toolID = input.toolID
    const phase = managers.phase.current()

    if (toolID === "aion_critic_dispatch") {
      const hint = CRITIC_DISPATCH_PHASE_HINTS[phase]
      if (hint) {
        output.description = output.description + `\n\n[AION Phase: ${phase}]${hint}`
      }
    } else if (toolID === "aion_critic_verdict") {
      const hint = VERDICT_PHASE_HINTS[phase]
      if (hint) {
        output.description = output.description + `\n\n[AION Phase: ${phase}]${hint}`
      }
    } else if (PHASE_DESCRIPTION_SUFFIX[toolID] && phase === "init" && toolID === "aion_workspace_init") {
      output.description = output.description + PHASE_DESCRIPTION_SUFFIX[toolID]
    } else if (toolID === "question") {
      if (!managers.interactiveMode.isResolved()) {
        // Should not reach here anymore since system-transform auto-resolves, but just in case
        output.description =
          (output.description ?? "") +
          `\n\n[AION] The question tool is available. Use it ONLY when you are genuinely uncertain about the best course of action and need user input. Do NOT ask routine or obvious questions.`
      } else if (managers.interactiveMode.isInteractive() && managers.state.governance.lastCCriticVerdict === "approve-stop" && managers.state.governance.userContinueDecision === "unset") {
        output.description =
          (output.description ?? "") +
          `\n\n[AION INTERACTIVE MODE — USER CHECK REQUIRED] c-critic has approved closeout. You MUST call this tool to ask the user whether to continue another round or stop the loop. The exact call:\n\nquestion(questions=[{question: "c-critic has approved closeout. How should the loop continue?", header: "Continue or stop?", options: [{label: "Continue another round", description: "Reject closeout, re-enter loop, have agents refine more"}, {label: "Stop and finalize", description: "Approve closeout, end the loop, deliver final results"}]}])`
      } else {
        output.description =
          (output.description ?? "") +
          `\n\n[AION] The question tool is available. Use it ONLY when you are genuinely uncertain about the best course of action and need user input. Do NOT ask routine or obvious questions.`
      }
    }

    info("[aion] tool.definition: enriched", { toolID, phase })
  }
}
