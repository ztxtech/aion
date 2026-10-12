/**
 * Per-tier phase-gate rules.
 *
 * For each (tier, phase) tuple, this file returns the set of legal
 * subagent dispatches, or `null` if the phase is skipped at this tier.
 * The G1 hook in tool-guard.ts uses this to enforce hard edges; the
 * session-idle hook uses it to emit a single-sentence hint per phase.
 *
 * Skipped phases:
 *   - LIGHT  skips gather, ts-pre-review, ts-post-review, c-critic-final,
 *            loop-back. Main agent does the work directly.
 *   - MEDIUM skips gather, ts-pre-review, c-critic-final. Skips to
 *            implement, then ts-post-review, then done. No c-critic.
 *   - FULL   runs every phase, including c-critic-final.
 *
 * This file is the single source of truth for "who can be dispatched
 * where". It owns NO other state. state-machine.ts composes this with
 * worker-progress tracking; tool-guard.ts calls isLegalDispatchAt()
 * for the G1 hard-edge check.
 *
 * File location: src/scheduling/dispatch-rules.ts
 * Imports from: complexity.ts (the tier enum and TIER_RANK)
 * Consumed by: state-machine.ts, tool-guard.ts, session-idle.ts
 */

import type { AionPhase } from "../create-managers"
import type { ComplexityTier } from "./complexity"

// Subagent role types. Re-exported from this module so consumers do not
// have to depend on the legacy state-machine.ts for them. Future-proof
// for a 7th or 8th subagent: add a string to this union, the table
// below, and the AionTools registry.

export type WorkerAgent = "requirements-analyst" | "information-collector" | "coder"
export type CriticAgent = "ts-critic" | "c-critic"
export type DispatchableAgent = WorkerAgent | CriticAgent

/**
 * Per-(tier, phase) legal dispatch set.
 *
 *   - `null` means the phase does not exist at this tier (the main
 *     agent does not transition into it; trying to dispatch from it
 *     is a G1 violation).
 *   - `[]` means the phase exists at this tier but no further
 *     dispatches are allowed (terminal phase, or waiting on a
 *     verdict that will come from the existing tools).
 *   - Non-empty list is the set of subagent roles the main agent
 *     may dispatch from this phase at this tier.
 *
 * The shape is intentionally permissive: the G1 hook is the
 * enforcement boundary, this table is the rule book. If you add a
 * phase, add a row; if you add a tier, add a column.
 */
export const TIER_DISPATCH_RULES: Record<
  ComplexityTier,
  Partial<Record<AionPhase, readonly DispatchableAgent[] | null>>
> = {
  LIGHT: {
    init: ["requirements-analyst"], // workspace_init legacy; effectively a no-op
    gather: null, // skipped
    "ts-pre-review": null, // skipped
    implement: [], // main agent only; no subagents
    "ts-post-review": null, // skipped
    "c-critic-final": null, // skipped
    "loop-back": null, // skipped
    done: [], // terminal
  },
  MEDIUM: {
    init: ["requirements-analyst"],
    gather: null, // skipped — coder is dispatched directly from implement
    "ts-pre-review": null, // skipped — single ts-critic at the end, not pre
    implement: ["coder", "ts-critic"],
    "ts-post-review": ["ts-critic"],
    "c-critic-final": null, // skipped — ts-critic allow-stop is sufficient
    "loop-back": ["requirements-analyst", "information-collector"], // on reject, escalate
    done: [],
  },
  FULL: {
    init: ["requirements-analyst", "ts-critic"], // ts-critic reviews the plan before requirements-analyst
    gather: ["requirements-analyst", "information-collector", "ts-critic"],
    "ts-pre-review": ["ts-critic"],
    implement: ["coder", "ts-critic"],
    "ts-post-review": ["ts-critic"],
    "c-critic-final": ["c-critic"],
    "loop-back": ["requirements-analyst", "information-collector"],
    done: [],
  },
}

/**
 * Returns the set of legal agents at (tier, phase), or `null` if the
 * phase is skipped at this tier. A `null` return and an empty-array
 * return are semantically distinct:
 *
 *   - `null`  -> the phase is skipped at this tier. The orchestrator
 *                advances to the next legal phase; the G1 hook rejects
 *                any dispatch from this phase as "phase skipped".
 *   - `[]`    -> the phase exists at this tier but no further dispatches
 *                are allowed (terminal, or waiting on a verdict).
 */
export function legalDispatchesAt(
  tier: ComplexityTier,
  phase: AionPhase,
): readonly DispatchableAgent[] | null {
  const rules = TIER_DISPATCH_RULES[tier]
  if (rules === undefined) return null
  const v = rules[phase]
  // Note: ?? is wrong here. The table stores `null` to mean "skipped"
  // and `[]` to mean "no dispatches". Collapsing them with ?? would
  // hide the skipped case from the G1 hook.
  if (v === undefined) return []
  return v
}

/**
 * Returns true iff dispatching `agent` from `phase` at `tier` is on a
 * legal edge. Skipped phases (null) reject every dispatch.
 */
export function isLegalDispatchAt(
  tier: ComplexityTier,
  phase: AionPhase,
  agent: DispatchableAgent,
): boolean {
  const allowed = legalDispatchesAt(tier, phase)
  if (allowed === null) return false
  return allowed.includes(agent)
}

/**
 * Human-readable explanation of legal dispatches from this (tier,
 * phase). Used by the G1 hook to produce a short error message when
 * a dispatch is rejected. Returns "(none — terminal phase)" or
 * "(none — phase skipped at this tier)" as appropriate.
 */
export function describeLegalDispatchesAt(tier: ComplexityTier, phase: AionPhase): string {
  const set = legalDispatchesAt(tier, phase)
  if (set === null) return "(none — phase skipped at tier " + tier + ")"
  if (set.length === 0) return "(none — terminal phase)"
  return set.join(", ")
}

/**
 * Returns the next legal phase after the current one, given the tier.
 * Used by the orchestrator when a phase completes successfully. If
 * the current phase is skipped at this tier, returns the first
 * non-skipped successor.
 */
export function nextPhaseAt(tier: ComplexityTier, phase: AionPhase): AionPhase | null {
  const PHASE_ORDER: AionPhase[] = [
    "init",
    "gather",
    "ts-pre-review",
    "implement",
    "ts-post-review",
    "c-critic-final",
    "done",
  ]
  const idx = PHASE_ORDER.indexOf(phase)
  if (idx === -1 || idx === PHASE_ORDER.length - 1) return null
  for (let i = idx + 1; i < PHASE_ORDER.length; i++) {
    const candidate = PHASE_ORDER[i]
    if (legalDispatchesAt(tier, candidate) !== null) return candidate
  }
  return null
}