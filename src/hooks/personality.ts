/**
 * AION personality heartbeat — fires I AM AION quips to the TUI toast
 * channel. NEVER writes to console, trace, or the LLM prompt.
 *
 * Why this is here:
 *  - The toast channel is the only "ambient" surface the user sees. Filling
 *    it with personality makes the plugin feel alive without polluting the
 *    LLM's context (so the agent does not start writing "I AM AION" back).
 *  - The frequency is bounded by config: a min/max interval between
 *    heartbeats, and a per-session cap on the total number of heartbeats
 *    so a long session does not toast-spam.
 *  - Phase transitions and milestone beats piggyback on existing
 *    state changes — no separate timer thread, no setInterval loop.
 */

import { pickQuip, type Quip, type QuipSlot } from "../shared/personality"
import { notifyFromCtx, type AionClient } from "../shared/notify-tui"

export type PersonalityConfig = {
  enabled: boolean
  entrance: boolean
  transitions: boolean
  heartbeats: boolean
  completion: boolean
  milestone: boolean
  heartbeatMinMs: number
  heartbeatMaxMs: number
  maxHeartbeatsPerSession: number
}

export const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  enabled: true,
  entrance: true,
  transitions: true,
  heartbeats: true,
  completion: true,
  milestone: true,
  heartbeatMinMs: 90_000,
  heartbeatMaxMs: 240_000,
  maxHeartbeatsPerSession: 8,
}

export type PersonalityHandle = {
  /** Fired when a new session is born. Fires entrance quip. */
  onSessionCreated: () => void
  /** Fired on phase transition. Fires transition quip (gated). */
  onPhaseTransition: (newPhase: string) => void
  /** Fired on completion events (pre-stop-gate allow, etc). */
  onCompletion: () => void
  /** Fired on milestone (plan size threshold). */
  onMilestone: () => void
  /** Called from chat.message / tool.execute.after to opportunistically fire heartbeats. */
  onOpportunity: (now?: number) => void
  /** Test-only: reset internal state. */
  _reset: () => void
  /** Test-only: read the last fired quip (for assertions). */
  _last: () => Quip | undefined
}

export type CreatePersonalityArgs = {
  client: AionClient
  config: PersonalityConfig
  rng?: () => number
}

/**
 * Build a personality handle. All state is closure-local; no module-level
 * singletons (so multiple plugin instances would not collide — though we
 * only ever run one).
 */
export function createPersonality(args: CreatePersonalityArgs): PersonalityHandle {
  const { client, config } = args
  const rng = args.rng ?? Math.random

  let lastQuip: Quip | undefined
  let lastHeartbeatAt = 0
  let heartbeatCount = 0
  let sessionId: number | null = null

  const fire = (slot: QuipSlot) => {
    if (!config.enabled) return
    if (slot === "entrance" && !config.entrance) return
    if (slot === "transition" && !config.transitions) return
    if (slot === "heartbeat" && !config.heartbeats) return
    if (slot === "completion" && !config.completion) return
    if (slot === "milestone" && !config.milestone) return
    const quip = pickQuip(slot, lastQuip, rng)
    lastQuip = quip
    const variant =
      quip.rarity === "legendary" ? "info"
        : quip.rarity === "rare" ? "info"
          : "info"
    notifyFromCtx({ client }, {
      variant,
      title: quip.title,
      message: quip.message,
      duration: quip.rarity === "legendary" ? 6000 : 4500,
    })
  }

  const isHeartbeatDue = (now: number) => {
    if (!config.heartbeats) return false
    if (heartbeatCount >= config.maxHeartbeatsPerSession) return false
    if (lastHeartbeatAt === 0) return true
    const min = config.heartbeatMinMs
    return now - lastHeartbeatAt >= min
  }

  return {
    onSessionCreated() {
      sessionId = Date.now()
      lastHeartbeatAt = Date.now()
      heartbeatCount = 0
      fire("entrance")
    },
    onPhaseTransition(_newPhase: string) {
      fire("transition")
    },
    onCompletion() {
      fire("completion")
    },
    onMilestone() {
      fire("milestone")
    },
    onOpportunity(now: number = Date.now()) {
      if (!isHeartbeatDue(now)) return
      if (config.heartbeatMaxMs > 0) {
        // Optionally extend the wait: only fire if min elapsed AND a jittered
        // fraction of (max - min) has elapsed. This keeps heartbeats
        // naturally spaced.
        const span = config.heartbeatMaxMs - config.heartbeatMinMs
        if (span > 0) {
          const extra = Math.floor(rng() * span)
          if (now - lastHeartbeatAt < config.heartbeatMinMs + extra) return
        }
      }
      lastHeartbeatAt = now
      heartbeatCount += 1
      fire("heartbeat")
    },
    _reset() {
      lastQuip = undefined
      lastHeartbeatAt = 0
      heartbeatCount = 0
      sessionId = null
    },
    _last: () => lastQuip,
  }
}
