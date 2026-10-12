/**
 * `chat.params` hook — per-request sampling-temperature control.
 *
 * Strategy:
 *   - Critic agents (ts-critic, c-critic) always get near-deterministic
 *     params (temp 0.05, topP 0.8, topK 1) for reproducible verdicts.
 *   - All other agents get phase-tuned params from {@link PHASE_TEMPERATURES}:
 *     review phases are colder, gather/implement phases are warmer.
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionChatParamsHook } from "./types"
import type { AionPhase } from "../create-managers"
import { info } from "../shared/logger"

const PHASE_TEMPERATURES: Record<AionPhase, { temperature: number; topP: number }> = {
  init: { temperature: 0.3, topP: 0.9 },
  gather: { temperature: 0.4, topP: 0.9 },
  "ts-pre-review": { temperature: 0.1, topP: 0.85 },
  implement: { temperature: 0.3, topP: 0.9 },
  "ts-post-review": { temperature: 0.1, topP: 0.85 },
  "c-critic-final": { temperature: 0.05, topP: 0.8 },
  "loop-back": { temperature: 0.4, topP: 0.9 },
  done: { temperature: 0.3, topP: 0.9 },
}

const CRITIC_AGENTS = new Set(["ts-critic", "c-critic"])

export function createChatParamsHook(args: CreateHooksArgs): AionChatParamsHook {
  const { managers } = args

  return async function chatParams(input, output) {
    const phase = managers.phase.current()
    const agent = input.agent ?? "unknown"

    const phaseParams = PHASE_TEMPERATURES[phase]

    if (CRITIC_AGENTS.has(agent)) {
      output.temperature = 0.05
      output.topP = 0.8
      output.topK = 1
      info("[aion] chat.params: critic agent override", {
        agent,
        phase,
        temperature: output.temperature,
        topP: output.topP,
      })
      return
    }

    output.temperature = phaseParams.temperature
    output.topP = phaseParams.topP

    info("[aion] chat.params: phase-based params", {
      agent,
      phase,
      temperature: output.temperature,
      topP: output.topP,
    })
  }
}
