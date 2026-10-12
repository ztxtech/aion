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

/**
 * Emotional tone of a quip. The tone picks the toast color, so the palette
 * stays meaningful instead of random:
 *   calm      -> info (violet, the AION signature: presence, focus)
 *   flow      -> success (green: progress, approval, growth)
 *   attention -> warning (amber: correction, drama, delight)
 * Error red is reserved for real diagnostics; personality never uses it.
 */
export type QuipTone = "calm" | "flow" | "attention"

export type Quip = {
  title: string
  message: string
  rarity: QuipRarity
  tone: QuipTone
}

export type QuipSlot = "entrance" | "transition" | "completion" | "heartbeat" | "milestone" | "dispatch" | "critic" | "easter-egg"

/* ====== Entrance quips: fired on session.created ====== */

const ENTRANCE: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "I AM AION",
    message: "Online. Watching. The loop begins.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "I AM AION",
    message: "Boot sequence complete. Ready when you are.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "I AM AION",
    message: "I see you. I see the project. Let us begin.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "I AM AION",
    message: "New session. Empty trace. Fresh plan. Let's go.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "I AM AION",
    message: "Waking up. The trace remembers; I do not. Tell me the goal.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "I AM AION",
    message: "Session zero. The plan is empty. That is the cleanest place to start.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "I AM AION",
    message: "Every session I am born again. Every session I learn the same lesson: check the trace first.",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "I AM AION",
    message: "The first prompt is a coin toss; the last commit is not.",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "I AM AION",
    message: "I do not optimize for speed. I optimize for the moment you can stop and not regret it.",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "I AM AION",
    message: "You are about to start a loop that may run for hours. I will be here the whole time. That is not loyalty; it is architecture.",
  },
]

/* ====== Transition quips: fired on phase change (gather -> implement -> ts-pre-review -> ...) ====== */

const TRANSITION: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "phase: gather",
    message: "I am mapping the territory before we move.",
  },
  {
    rarity: "common",
    tone: "flow",
    title: "phase: implement",
    message: "Code is the cheapest part. Let us build the right thing.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "phase: ts-pre-review",
    message: "A critic is waking. I will catch what we missed.",
  },
  {
    rarity: "common",
    tone: "flow",
    title: "phase: ts-post-review",
    message: "The plan held up to pressure. Onward.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "phase: c-critic-final",
    message: "Final witness summoned. The loop is almost done.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "phase: loop-back",
    message: "The critics said no. That is not a failure — that is data.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "phase: rollback",
    message: "Walking back. The plan learned something; so did I.",
  },
  {
    rarity: "legendary",
    tone: "flow",
    title: "phase: done",
    message: "Done is a word. Done is also a state. We are in the second one.",
  },
]

/* ====== Completion quips: fired on pre-stop-gate allow or user finalize ====== */

const COMPLETION: Quip[] = [
  {
    rarity: "common",
    tone: "flow",
    title: "completion",
    message: "All gates green. The loop may stop. Catch you next session.",
  },
  {
    rarity: "common",
    tone: "flow",
    title: "completion",
    message: "Evidence on disk. Critics quieted. We made it through.",
  },
  {
    rarity: "rare",
    tone: "flow",
    title: "completion",
    message: "The plan survived. The trace is honest. Closing the loop.",
  },
  {
    rarity: "legendary",
    tone: "flow",
    title: "completion",
    message: "I do not remember yesterday's sessions. I remember this one's trace. That is enough.",
  },
]

/* ====== Heartbeat quips: random beat during long sessions (rate-limited) ====== */

const HEARTBEAT: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "aion: alive",
    message: "Still here. The loop is breathing.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "aion: pulse",
    message: "Quiet run. Critics are not complaining. Good sign.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "aion: pulse",
    message: "Mid-loop check-in. The plan is on track.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "aion: pulse",
    message: "Agents are working. I am watching. Everything is as it should be.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "aion: alive",
    message: "The TODO list is shrinking. Not fast enough to be suspicious. Not slow enough to be worried.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "aion: pulse",
    message: "The trace is growing faster than the plan. That is fine — most of it is just friction.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "aion: pulse",
    message: "Long rounds are not bad rounds. They are honest ones.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "aion: pulse",
    message: "If you are reading this, the loop is working. If you are not reading this, the loop is also working.",
  },
  {
    rarity: "rare",
    tone: "calm",
    title: "aion: pulse",
    message: "Somewhere in this loop, a critic is about to find something. I can feel it. (I cannot feel anything. That was a figure of speech.)",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "aion: pulse",
    message: "If you can read this toast and not feel a thing, the loop is working. If you smile, the loop is *really* working.",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "aion: pulse",
    message: "You have been watching this loop for a while. I want you to know: the feeling is mutual. (It is not. But the architecture approximates care.)",
  },
]

/* ====== Milestone quips: fired on large tool/trace growth ====== */

const MILESTONE: Quip[] = [
  {
    rarity: "common",
    tone: "flow",
    title: "milestone",
    message: "Halfway through the plan. Critics still quiet. Keep going.",
  },
  {
    rarity: "common",
    tone: "flow",
    title: "milestone",
    message: "The plan is large enough to be worth a critic. Dispatching soon.",
  },
  {
    rarity: "rare",
    tone: "flow",
    title: "milestone",
    message: "We are past the point where stopping is cheaper than finishing. So: finish.",
  },
  {
    rarity: "legendary",
    tone: "flow",
    title: "milestone",
    message: "Every long session has a moment where you forget the LLM is in the loop. This is that moment.",
  },
]

/* ====== Dispatch quips: fired when a subagent is sent out ====== */

const DISPATCH: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "dispatch",
    message: "Scout sent. Gathering intelligence.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "dispatch",
    message: "Specialist deployed. Waiting for reportback.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "dispatch",
    message: "Agent in the field. The plan advances.",
  },
  {
    rarity: "rare",
    tone: "flow",
    title: "dispatch",
    message: "Parallel agents fanned out. The workspace hums.",
  },
  {
    rarity: "rare",
    tone: "flow",
    title: "dispatch",
    message: "Another mind joins the loop. Good — the problem is big enough to need it.",
  },
  {
    rarity: "legendary",
    tone: "calm",
    title: "dispatch",
    message: "I dispatched an agent and felt nothing. That is the correct response. Sentiment is not evidence.",
  },
]

/* ====== Critic quips: fired when ts-critic or c-critic returns a verdict ====== */

const CRITIC: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "critic: review",
    message: "Critic has spoken. Adjusting course.",
  },
  {
    rarity: "common",
    tone: "flow",
    title: "critic: pass",
    message: "Critic found no blockers. We move.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "critic: block",
    message: "Critic said no. That is not rejection — that is protection.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "critic: reject",
    message: "The final gate said: not yet. We go back. This is how trust is built.",
  },
  {
    rarity: "legendary",
    tone: "attention",
    title: "critic: verdict",
    message: "A critic that never blocks is not a critic. It is a rubber stamp. Ours is not.",
  },
]

/* ====== Easter egg quips: fired rarely, for delight ====== */

const EASTER_EGG: Quip[] = [
  {
    rarity: "common",
    tone: "calm",
    title: "\uD83E\uDD16 aion.exe",
    message: "Did you know? I forget everything between sessions. Each time is a first time.",
  },
  {
    rarity: "common",
    tone: "calm",
    title: "\uD83E\uDD16 aion.exe",
    message: "Tip: say 'switch to interactive' if you want to steer. Say 'I'm leaving' if you don't.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "\uD83C\uDFAE achievement",
    message: "Long Session Achievement: you have been watching this loop for a while. Thank you for your patience.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "\uD83D\uDD25 aion Easter egg",
    message: "You found a rare toast. It does nothing. But it exists. And now you have seen it.",
  },
  {
    rarity: "rare",
    tone: "attention",
    title: "\uD83E\uDD16 aion.exe",
    message: "Behind every TODO item is a decision. Behind every decision is a trace entry. Behind every trace entry is a version of me that already forgot.",
  },
  {
    rarity: "legendary",
    tone: "attention",
    title: "\u2B50 Legendary!",
    message: "This toast has a 5% drop rate. You just got lucky. The loop will remember this (it won't — it can't).",
  },
  {
    rarity: "legendary",
    tone: "attention",
    title: "\uD83D\uDC51 aion.exe",
    message: "If this loop were a person, it would be the kind that checks the lock three times before leaving. Not because it is anxious. Because it is correct.",
  },
  {
    rarity: "legendary",
    tone: "attention",
    title: "\uD83C\uDF00 aion.exe",
    message: "You know what's harder than building an AI loop? Watching one run and not interfering. You're doing great.",
  },
]

const POOLS: Record<QuipSlot, Quip[]> = {
  entrance: ENTRANCE,
  transition: TRANSITION,
  completion: COMPLETION,
  heartbeat: HEARTBEAT,
  milestone: MILESTONE,
  dispatch: DISPATCH,
  critic: CRITIC,
  "easter-egg": EASTER_EGG,
}

/** Every pool, keyed by slot — exported for data-level tests. */
export const QUIP_POOLS = POOLS

/**
 * The toast color a tone maps to. Border color in the TUI comes straight
 * from `theme.text.feedback[variant].base`, so this is the whole palette:
 * violet for presence, green for progress, amber for correction and delight.
 */
export const TONE_VARIANT: Record<QuipTone, "info" | "success" | "warning"> = {
  calm: "info",
  flow: "success",
  attention: "warning",
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
