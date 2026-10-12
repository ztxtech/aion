/**
 * AION personality heartbeat — fires I AM AION quips to the TUI toast
 * channel. NEVER writes to console, trace, or the LLM prompt.
 *
 * Why this is here:
 *  - The toast channel is the only "ambient" surface the user sees. Filling
 *    it with personality makes the plugin feel alive without polluting the
 *    LLM's context (so the agent does not start writing "I AM AION" back).
 *    On OpenCode V2 the quip travels through the disk toast queue, which the
 *    TUI plugin renders in the top-right notification panel.
 *  - The frequency is bounded by config: a min/max interval between
 *    heartbeats, and a per-session cap on the total number of heartbeats
 *    so a long session does not toast-spam.
 *  - Phase transitions and milestone beats piggyback on existing
 *    state changes — no separate timer thread, no setInterval loop.
 */

import { TONE_VARIANT, pickQuip, type Quip, type QuipSlot } from "../shared/personality"
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
  heartbeatMinMs: 60_000,
  heartbeatMaxMs: 180_000,
  maxHeartbeatsPerSession: 12,
}

/** Two entrance beats closer than this collapse into one (boot + first session). */
const ENTRANCE_MIN_INTERVAL_MS = 60_000

export type PersonalityHandle = {
  /** Fired when a new session is born. Fires entrance quip. */
  onSessionCreated: () => void
  /** Fired on phase transition. Fires transition quip (gated). */
  onPhaseTransition: (newPhase: string) => void
  /** Fired on completion events (pre-stop-gate allow, etc). */
  onCompletion: () => void
  /** Fired on milestone (plan size threshold). */
  onMilestone: () => void
  /** Fired when a subagent is dispatched. */
  onDispatch: (agentName: string) => void
  /** Fired when a critic returns a verdict. */
  onCriticVerdict: (critic: string, verdict: string) => void
  /** Fired randomly during long waits — easter egg slot. */
  onEasterEgg: () => void
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
  /** Workspace root — where the V2 toast queue lives. */
  directory?: string
  rng?: () => number
  /** Injectable clock for tests; defaults to Date.now. */
  clock?: () => number
}

/**
 * Build a personality handle. All state is closure-local; no module-level
 * singletons (so multiple plugin instances would not collide — though we
 * only ever run one).
 */
export function createPersonality(args: CreatePersonalityArgs): PersonalityHandle {
  const { client, config, directory } = args
  const rng = args.rng ?? Math.random
  const clock = args.clock ?? (() => Date.now())

  let lastQuip: Quip | undefined
  let lastHeartbeatAt = 0
  let lastEntranceAt: number | null = null
  let heartbeatCount = 0
  let sessionId: number | null = null

  const fire = (slot: QuipSlot) => {
    if (!config.enabled) return
    if (slot === "entrance" && !config.entrance) return
    if (slot === "transition" && !config.transitions) return
    if (slot === "heartbeat" && !config.heartbeats) return
    if (slot === "completion" && !config.completion) return
    if (slot === "milestone" && !config.milestone) return
    if (slot === "dispatch" && !config.transitions) return
    if (slot === "critic" && !config.transitions) return
    if (slot === "easter-egg" && !config.heartbeats) return
    // Boot fire + the session.created that follows right after must read as
    // one "AION is awake" beat, not two stacked toasts.
    if (slot === "entrance") {
      const stamp = clock()
      if (lastEntranceAt !== null && stamp - lastEntranceAt < ENTRANCE_MIN_INTERVAL_MS) return
      lastEntranceAt = stamp
    }
    const quip = pickQuip(slot, lastQuip, rng)
    lastQuip = quip
    // Color follows the emotional tone (violet / green / amber); rarity only
    // decides the glyph and how long the toast lingers.
    const variant = TONE_VARIANT[quip.tone]
    const duration =
      quip.rarity === "legendary" ? 8000
        : quip.rarity === "rare" ? 6000
          : 4500
    const glyph =
      quip.rarity === "legendary" ? "\uD83C\uDF1F "   // star, for the rarest beats
        : quip.rarity === "rare" ? "\u2728 "            // sparkles
          : ""
    notifyFromCtx({ client, directory }, {
      variant,
      title: `${glyph}${quip.title}`,
      message: quip.message,
      duration,
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
      sessionId = clock()
      lastHeartbeatAt = clock()
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
    onDispatch(_agentName: string) {
      fire("dispatch")
    },
    onCriticVerdict(_critic: string, _verdict: string) {
      fire("critic")
    },
    onEasterEgg() {
      fire("easter-egg")
    },
    onOpportunity(now: number = clock()) {
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
      lastEntranceAt = null
      heartbeatCount = 0
      sessionId = null
    },
    _last: () => lastQuip,
  }
}
