/**
 * No-progress detector.
 *
 * Failure mode observed in the 2026-07-08 unit-test run
 * (`/Users/ztx/Documents/code/tmp/aion-demo/aion-plug/20260708-225630`):
 *
 *   Same-signature loops: the LLM dispatches ts-critic, gets
 *   `absolutely-cannot-stop-now`, regenerates a slightly different
 *   blockers list, and dispatches ts-critic again. The original
 *   breaker signature included the blockers content hash, so this
 *   counted as a NEW signature every time and never tripped.
 *
 * The new design fixes that by:
 *
 *   - `verdictSignature` is now `(agent, phase, verdict)` ONLY. The
 *     blockers content does not enter the signature. Rephrasing
 *     blockers no longer escapes the breaker.
 *
 * What this module is NOT:
 *
 *   - It is NOT a hard force-stop. Per user feedback (2026-07-09),
 *     "different tasks have different run counts; controlling the
 *     run count is meaningless; I want maximum adaptivity." So the
 *     previous `MAX_TOTAL_TRIPS = 10` force-stop was REMOVED. The
 *     detector only emits a hint; the LLM is free to iterate.
 *
 *   - The real "force advance" lives in the phase machine: when
 *     ts-critic returns `allow-stop` for a contract review, the
 *     session-idle hook rejects any dispatch other than
 *     `coder`, `information-collector`, or `requirements-analyst`
 *     (re-revise). The LLM cannot loop forever in the contract
 *     phase.
 *
 *   - The hard stop on long sessions is `maxRounds = 30` in the
 *     AION config. We do not change that here; rounds are
 *     different from trip counts.
 *
 * File location: src/scheduling/no-progress.ts
 * Consumed by: src/hooks/session-idle.ts (after every verdict)
 * Produces: a hint string only. No force-stop.
 */

import {
  noProgressThreshold,
  type ComplexityTier,
} from "./complexity"

/** Ring buffer size. */
const RING_BUFFER_SIZE = 16

/** A single verdict record. */
export type VerdictRecord = {
  agent: string
  phase: string
  verdict: string
  /** KEPT for backward compat; IGNORED by verdictSignature. */
  blockersContent: string
}

/** Result of a detector check. Hint only — no force-stop. */
export type BreakerResult = {
  /** True iff the same signature has appeared N times in a row (per-tier threshold). */
  tripped: boolean
  /** The signature that triggered the trip (if any). */
  signature: string | null
  /** How many times this signature has appeared in the buffer. */
  count: number
  /** The per-tier threshold. */
  threshold: number
  /** Lifetime total of trips (across all signatures) since the detector was created. */
  totalTrips: number
}

/**
 * Lightweight ring buffer. Owns its data; never reads from outside.
 */
export class VerdictRing {
  private buf: string[] = []
  private head = 0
  private size = 0

  push(sig: string): void {
    this.buf[this.head] = sig
    this.head = (this.head + 1) % RING_BUFFER_SIZE
    if (this.size < RING_BUFFER_SIZE) this.size++
  }

  countOf(sig: string): number {
    let n = 0
    for (let i = 0; i < this.size; i++) if (this.buf[i] === sig) n++
    return n
  }

  clear(): void {
    this.buf = []
    this.head = 0
    this.size = 0
  }

  /** Snapshot of the buffer for debugging / tests. */
  snapshot(): string[] {
    return this.buf.slice(0, this.size)
  }
}

/**
 * Compute a stable signature for a verdict record.
 *
 * The signature is `(agent, phase, verdict)` ONLY. The blockers
 * content is intentionally NOT part of the signature: the LLM
 * regenerates the blockers list every turn, so including the
 * content would let the LLM escape the detector by rephrasing.
 */
export function verdictSignature(rec: VerdictRecord): string {
  return [rec.agent, rec.phase, rec.verdict].join("|")
}

/**
 * No-progress detector instance. Hint only.
 *
 * Used by session-idle.ts to emit a BREAKER_HINT when the same
 * (agent, phase, verdict) signature fires repeatedly. Does NOT
 * force-stop the session. The hard transitions are enforced
 * elsewhere (force-advance on allow-stop, maxRounds cap).
 */
export class NoProgressBreaker {
  private ring = new VerdictRing()
  private totalTrips = 0

  /**
   * Record a new verdict and check if the detector should fire.
   * Returns a BreakerResult. Caller decides whether to inject
   * the hint. The detector itself does NOT force-stop.
   */
  recordAndCheck(rec: VerdictRecord, tier: ComplexityTier): BreakerResult {
    const sig = verdictSignature(rec)
    this.ring.push(sig)
    this.totalTrips += 1
    const threshold = noProgressThreshold(tier)
    const count = this.ring.countOf(sig)
    const tripped = count >= threshold
    return {
      tripped,
      signature: tripped ? sig : null,
      count,
      threshold,
      totalTrips: this.totalTrips,
    }
  }

  /** Reset the detector. */
  reset(): void {
    this.ring.clear()
    this.totalTrips = 0
  }

  /** Snapshot for tests and debugging. */
  snapshot(): string[] {
    return this.ring.snapshot()
  }

  /** Current lifetime trip count. */
  getTotalTrips(): number {
    return this.totalTrips
  }
}

/**
 * The hint string injected when the detector fires. The LLM is
 * free to ignore this — the detector does NOT force-stop. The
 * real "you must advance now" message comes from the session-idle
 * hook after a ts-critic allow-stop verdict.
 */
export const BREAKER_HINT = `[AION NO-PROGRESS DETECTOR]
The same (agent, phase, verdict) signature has fired
<count>/<threshold> times. The loop may not be converging.

Suggestions:
  (a) If the verdict is 'absolutely-cannot-stop-now', escalate the
      complexity tier via aion_set_complexity if the original
      classification was too light, OR document the no-go zone
      in negative.md and transition to done with a 'best effort'
      report.
  (b) If the verdict is 'allow-stop' and you are still dispatching
      the same critic, the issue is structural -- the contract is
      ready and you should advance to the next phase (e.g. dispatch
      coder) instead of re-running the same critic.
  (c) If you keep getting 'absolutely-cannot-stop-now' on the
      same wall, the loop is real. Use a different strategy
      (e.g. ask the user, or finish the session with a partial
      report).

This detector does NOT force-stop your session. The force-stop
happens elsewhere (max-rounds cap, allow-stop transition). If
you believe further iteration will help, keep going — but pay
attention to the next-step hint in the next prompt.`
