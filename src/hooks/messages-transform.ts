import type { CreateHooksArgs } from "../create-hooks"
import type { AionMessagesTransformHook } from "./types"
import { info } from "../shared/logger"

const SYSTEM_ROLE = "system" as const

export function createMessagesTransformHook(args: CreateHooksArgs): AionMessagesTransformHook {
  const { managers } = args

  return async function messagesTransform(_input, output) {
    const phase = managers.phase.current()
    const round = managers.state.rounds.current
    const rebuttalMode = managers.state.governance.rebuttalMode
    const dispatchTarget = managers.state.governance.lastDispatchTarget

    const messages = output.messages
    if (!messages || messages.length === 0) return

    // === B. Context mode enforcement ===

    // minimal_context: c-critic only sees system messages + last user + last assistant
    if (phase === "c-critic-final" || dispatchTarget === "c-critic") {
      if (messages.length <= 4) return

      const systemMessages = messages.filter(
        (m: { info: { role: string } }) => m.info.role === SYSTEM_ROLE,
      )
      const lastUser = messages
        .filter((m: { info: { role: string } }) => m.info.role === "user")
        .slice(-1)
      const lastAssistant = messages
        .filter((m: { info: { role: string } }) => m.info.role === "assistant")
        .slice(-1)

      const compressed = [...systemMessages, ...lastUser, ...lastAssistant]
      if (compressed.length < messages.length) {
        output.messages = compressed
        info("[aion] messages.transform: minimal_context (c-critic)", {
          originalCount: messages.length,
          compressedCount: compressed.length,
          phase,
        })
      }
      return
    }

    // rebuttal_context: keep system + last user (blocker list) + last few assistant messages
    if (rebuttalMode) {
      const systemMessages = messages.filter(
        (m: { info: { role: string } }) => m.info.role === SYSTEM_ROLE,
      )
      const recentMessages = messages.slice(-6)
      const compressed = [...systemMessages, ...recentMessages]
      if (compressed.length < messages.length) {
        output.messages = compressed
        info("[aion] messages.transform: rebuttal_context compression", {
          originalCount: messages.length,
          compressedCount: compressed.length,
          phase,
        })
      }
      return
    }

    // === K. compacted_context: round 2+ defaults to compressed history ===
    if (round >= 2) {
      const maxHistory = 8
      if (messages.length <= maxHistory) return

      const systemMessages = messages.filter(
        (m: { info: { role: string } }) => m.info.role === SYSTEM_ROLE,
      )
      const recentMessages = messages.slice(-maxHistory)
      const compressed = [...systemMessages, ...recentMessages]

      if (compressed.length < messages.length) {
        output.messages = compressed
        info("[aion] messages.transform: compacted_context (round >= 2)", {
          originalCount: messages.length,
          compressedCount: compressed.length,
          round,
        })
      }
    }
  }
}
