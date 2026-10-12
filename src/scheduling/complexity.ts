/**
 * Task complexity tier — the single knob that controls how much ceremony
 * AION applies to a given task.
 *
 * Three tiers, ordered from lightest to heaviest:
 *
 *   - LIGHT: read-only or one-shot answer. Main agent only. No subagents,
 *     no critic gates. Exits as soon as the answer is on the page.
 *
 *   - MEDIUM: a single concrete change — modify a function, write a small
 *     script, do a single-source analysis, produce a focused artifact.
 *     Main agent dispatches at most one worker (coder, or the analyst if
 *     the change requires fresh context). One round of ts-critic at the
 *     end. No c-critic, no full pipeline.
 *
 *   - FULL: multi-source, training/eval loops, multi-step pipelines,
 *     anything where hidden requirements need explicit extraction.
 *     Main chain: requirements-analyst -> information-collector -> coder,
 *     with ts-critic pre/post each, c-critic final gate.
 *
 * The tier is decided **once** at session start (or first non-trivial
 * turn) by the main agent and recorded via aion_set_complexity. The
 * main agent can ESCALATE mid-session (LIGHT -> MEDIUM -> FULL) but
 * cannot de-escalate. This honors Karpathy's principle: never weaken
 * ceremony, only add it.
 *
 * Per-tier thresholds (used by the no-progress breaker):
 *
 *   - LIGHT:  2 repeated (agent, phase, verdict) in a row -> break.
 *   - MEDIUM: 3 repeated.
 *   - FULL:   5 repeated.
 *
 * Why dynamic: a LIGHT task that hits the same wall twice is almost
 * certainly stuck. A FULL task may need more rounds to converge, so
 * the breaker gives it more rope before pulling.
 *
 * File location: src/scheduling/complexity.ts
 * Authority:
 *   - src/scheduling/dispatch-rules.ts (consumes the tier rules)
 *   - src/scheduling/no-progress.ts    (consumes the threshold)
 *   - src/scheduling/state-machine.ts  (thin orchestrator)
 *   - src/tools/complexity.ts          (aion_set_complexity tool)
 *   - src/hooks/system-transform.ts    (classifier prompt injection)
 */

export const COMPLEXITY_TIERS = ["LIGHT", "MEDIUM", "FULL"] as const

export type ComplexityTier = (typeof COMPLEXITY_TIERS)[number]

/** Numeric rank for ordering. Higher = more ceremony. */
export const TIER_RANK: Record<ComplexityTier, number> = {
  LIGHT: 0,
  MEDIUM: 1,
  FULL: 2,
}

/** No-progress breaker threshold per tier. See file header for rationale. */
export const NO_PROGRESS_THRESHOLD: Record<ComplexityTier, number> = {
  LIGHT: 2,
  MEDIUM: 3,
  FULL: 5,
}

/** Human-readable description injected into the classifier prompt. */
export const TIER_DESCRIPTIONS: Record<ComplexityTier, string> = {
  LIGHT:
    "Read this file and tell me X. Show me the value of Y. Answer a single concrete question. " +
    "No code edits, no external data sources, no model training. The main agent does the work itself.",
  MEDIUM:
    "Modify a function or a small file. Write a focused script. Do a single-source analysis. " +
    "Produce one artifact (a report, a chart, a config change). " +
    "Dispatch at most one worker; one round of ts-critic review at the end. No c-critic gate.",
  FULL:
    "Multi-source data with hidden contracts. Training and evaluation loops. " +
    "Multi-step pipelines where requirements need explicit extraction. " +
    "Anything where guessing at the contract would burn time downstream. " +
    "Full pipeline: requirements-analyst -> information-collector -> coder, " +
    "with ts-critic pre/post each, c-critic final gate.",
}

/**
 * The classifier prompt that the main agent sees on its first turn.
 * Short by design — one decision, one call to aion_set_complexity.
 */
export const COMPLEXITY_CLASSIFIER_PROMPT =
  "[AION TASK COMPLEXITY]\n" +
  "Before dispatching any subagent, classify the task into one of three tiers:\n" +
  "\n" +
  "LIGHT  — read-only / one-shot answer, main agent alone.\n" +
  "MEDIUM — single concrete change, one worker + one ts-critic round.\n" +
  "FULL   — multi-source / training loops / hidden contracts, full pipeline.\n" +
  "\n" +
  "Call aion_set_complexity(tier=\"LIGHT\"|\"MEDIUM\"|\"FULL\", reason=\"...\") exactly once.\n" +
  "After that, follow that tier's dispatch rules. You may ESCALATE later\n" +
  "(LIGHT -> MEDIUM -> FULL) but you may NOT de-escalate. Escalation is\n" +
  "the main tool for handling 'this looked simple but isn't'.\n" +
  "\n" +
  "Tier guide (do not match mechanically, judge from context):\n" +
  Object.entries(TIER_DESCRIPTIONS)
    .map(([t, d]) => "  - " + t + ": " + d)
    .join("\n")

/** Returns the rank of a tier (higher = more ceremony). */
export function rankOf(tier: ComplexityTier): number {
  return TIER_RANK[tier]
}

/**
 * Returns true iff `next` is allowed as an escalation from `current`.
 * De-escalation is rejected even if the main agent asks.
 */
export function isAllowedEscalation(current: ComplexityTier, next: ComplexityTier): boolean {
  return rankOf(next) > rankOf(current)
}

/** Returns the threshold for the no-progress breaker at a given tier. */
export function noProgressThreshold(tier: ComplexityTier): number {
  return NO_PROGRESS_THRESHOLD[tier]
}

/** Coerces an unknown string to a known tier, defaulting to MEDIUM. */
export function coerceTier(raw: unknown): ComplexityTier {
  if (typeof raw === "string" && (COMPLEXITY_TIERS as readonly string[]).includes(raw)) {
    return raw as ComplexityTier
  }
  return "MEDIUM"
}