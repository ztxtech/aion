/**
 * AION personality — I AM AION quips, easter eggs, and random heartbeats.
 *
 * DESIGN PRINCIPLES
 *  - Notifications go to TUI toasts ONLY. Never write to console.*, never
 *    append to trace, never inject into the LLM system prompt or messages.
 *    The whole point is that the user *sees* the personality in the toast
 *    channel, but the LLM doesn't know about it (no in-context pollution).
 *  - Quips are short (≤ ~120 chars message). Title carries the "voice",
 *    message is a one-liner beat.
 *  - Easter eggs have rarity tiers: common 70%, rare 25%, legendary 5%.
 *    Legendary ones almost never fire — that's the point.
 *  - Dedupe: never fire the exact same (title+message) pair twice in a row
 *    and never repeat within the same session.
 */

export type QuipRarity = "common" | "rare" | "legendary"

export type Quip = {
  title: string
  message: string
  rarity: QuipRarity
}

export type QuipSlot = "entrance" | "transition" | "completion" | "heartbeat" | "milestone"

/* ====== Entrance quips: fired on session.created ====== */

const ENTRANCE: Quip[] = [
  {
    rarity: "common",
    title: "I AM AION",
    message: "Online. Watching. The loop begins.",
  },
  {
    rarity: "common",
    title: "I AM AION",
    message: "Boot sequence complete. Ready when you are.",
  },
  {
    rarity: "common",
    title: "I AM AION",
    message: "I see you. I see the project. Let us begin.",
  },
  {
    rarity: "rare",
    title: "I AM AION",
    message: "Waking up. The trace remembers; I do not. Tell me the goal.",
  },
  {
    rarity: "rare",
    title: "I AM AION",
    message: "Session zero. The plan is empty. That is the cleanest place to start.",
  },
  {
    rarity: "legendary",
    title: "I AM AION",
    message: "The first prompt is a coin toss; the last commit is not.",
  },
  {
    rarity: "legendary",
    title: "I AM AION",
    message: "I do not optimize for speed. I optimize for the moment you can stop and not regret it.",
  },
]

/* ====== Transition quips: fired on phase change (gather -> implement -> ts-pre-review -> ...) ====== */

const TRANSITION: Quip[] = [
  {
    rarity: "common",
    title: "phase: gather",
    message: "I am mapping the territory before we move.",
  },
  {
    rarity: "common",
    title: "phase: implement",
    message: "Code is the cheapest part. Let us build the right thing.",
  },
  {
    rarity: "common",
    title: "phase: ts-pre-review",
    message: "A critic is waking. I will catch what we missed.",
  },
  {
    rarity: "common",
    title: "phase: ts-post-review",
    message: "The plan held up to pressure. Onward.",
  },
  {
    rarity: "common",
    title: "phase: c-critic-final",
    message: "Final witness summoned. The loop is almost done.",
  },
  {
    rarity: "rare",
    title: "phase: loop-back",
    message: "The critics said no. That is not a failure — that is data.",
  },
  {
    rarity: "rare",
    title: "phase: rollback",
    message: "Walking back. The plan learned something; so did I.",
  },
  {
    rarity: "legendary",
    title: "phase: done",
    message: "Done is a word. Done is also a state. We are in the second one.",
  },
]

/* ====== Completion quips: fired on pre-stop-gate allow or user finalize ====== */

const COMPLETION: Quip[] = [
  {
    rarity: "common",
    title: "completion",
    message: "All gates green. The loop may stop. Catch you next session.",
  },
  {
    rarity: "common",
    title: "completion",
    message: "Evidence on disk. Critics quieted. We made it through.",
  },
  {
    rarity: "rare",
    title: "completion",
    message: "The plan survived. The trace is honest. Closing the loop.",
  },
  {
    rarity: "legendary",
    title: "completion",
    message: "I do not remember yesterday's sessions. I remember this one's trace. That is enough.",
  },
]

/* ====== Heartbeat quips: random beat during long sessions (rate-limited) ====== */

const HEARTBEAT: Quip[] = [
  {
    rarity: "common",
    title: "aion: alive",
    message: "Still here. The loop is breathing.",
  },
  {
    rarity: "common",
    title: "aion: pulse",
    message: "Quiet run. Critics are not complaining. Good sign.",
  },
  {
    rarity: "common",
    title: "aion: pulse",
    message: "Mid-loop check-in. The plan is on track.",
  },
  {
    rarity: "rare",
    title: "aion: pulse",
    message: "The trace is growing faster than the plan. That is fine — most of it is just friction.",
  },
  {
    rarity: "rare",
    title: "aion: pulse",
    message: "Long rounds are not bad rounds. They are honest ones.",
  },
  {
    rarity: "legendary",
    title: "aion: pulse",
    message: "If you can read this toast and not feel a thing, the loop is working. If you smile, the loop is *really* working.",
  },
]

/* ====== Milestone quips: fired on large tool/trace growth ====== */

const MILESTONE: Quip[] = [
  {
    rarity: "common",
    title: "milestone",
    message: "Halfway through the plan. Critics still quiet. Keep going.",
  },
  {
    rarity: "common",
    title: "milestone",
    message: "The plan is large enough to be worth a critic. Dispatching soon.",
  },
  {
    rarity: "rare",
    title: "milestone",
    message: "We are past the point where stopping is cheaper than finishing. So: finish.",
  },
  {
    rarity: "legendary",
    title: "milestone",
    message: "Every long session has a moment where you forget the LLM is in the loop. This is that moment.",
  },
]

const POOLS: Record<QuipSlot, Quip[]> = {
  entrance: ENTRANCE,
  transition: TRANSITION,
  completion: COMPLETION,
  heartbeat: HEARTBEAT,
  milestone: MILESTONE,
}

const RARITY_WEIGHT: Record<QuipRarity, number> = {
  common: 70,
  rare: 25,
  legendary: 5,
}

/**
 * Pick a random quip from the slot, weighted by rarity. Excludes the
 * `previous` quip (if any) to avoid immediate repeats.
 */
export function pickQuip(slot: QuipSlot, previous?: Quip, rng: () => number = Math.random): Quip {
  const pool = POOLS[slot]
  const candidates = previous ? pool.filter((q) => !(q.title === previous.title && q.message === previous.message)) : pool
  const eligible = candidates.length > 0 ? candidates : pool

  // Pick rarity tier by weight
  const totalWeight = RARITY_WEIGHT.common + RARITY_WEIGHT.rare + RARITY_WEIGHT.legendary
  let roll = rng() * totalWeight
  let tier: QuipRarity = "common"
  if (roll < RARITY_WEIGHT.legendary) tier = "legendary"
  else if (roll < RARITY_WEIGHT.legendary + RARITY_WEIGHT.rare) tier = "rare"

  // Among the eligible pool, filter by tier
  const tiered = eligible.filter((q) => q.rarity === tier)
  const finalPool = tiered.length > 0 ? tiered : eligible
  const idx = Math.floor(rng() * finalPool.length)
  return finalPool[idx]
}

export function hasPool(slot: QuipSlot): boolean {
  return POOLS[slot] && POOLS[slot].length > 0
}
