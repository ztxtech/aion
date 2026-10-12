/**
 * Serial-loop scheduling state machine — thin orchestrator.
 *
 * This file used to own LEGAL_EDGES, WorkerProgress, parseReportback,
 * and SCHEDULING_MERMAID directly. After the dynamic-complexity
 * refactor it delegates:
 *
 *   - Tier types and ranking ........ complexity.ts
 *   - Per-(tier, phase) rules ....... dispatch-rules.ts
 *   - Loop detection ................ no-progress.ts
 *   - Worker progress tracking ...... THIS FILE (kept here because
 *                                       it is per-session state, not
 *                                       a pure function)
 *   - Reportback parsing ............ THIS FILE (kept here because
 *                                       it is a pure function and
 *                                       depends on no other module)
 *
 * Three consumers:
 *   - G1 hook (tool-guard.ts: task dispatch edge check)
 *   - System prompt injection (system-transform.ts: Mermaid diagram)
 *   - Reportback protocol enforcement (next_call parser)
 *
 * Backwards-compatibility: this file still exports isLegalDispatch
 * (2-arg) and legalDispatchesFrom (1-arg). These default to the FULL
 * tier — the historical default — so existing tests keep working
 * without changes. New code should use the 3-arg / 2-arg variants
 * from dispatch-rules.ts, which are tier-aware.
 *
 * File location: src/scheduling/state-machine.ts
 */

import type { AionPhase } from "../create-managers"
import { coerceTier, type ComplexityTier } from "./complexity"
import {
  isLegalDispatchAt,
  legalDispatchesAt,
  describeLegalDispatchesAt,
  nextPhaseAt,
  type DispatchableAgent,
  type WorkerAgent,
} from "./dispatch-rules"

// Re-export the per-tier types so legacy callers that imported them
// from state-machine keep working.
export type { WorkerAgent, DispatchableAgent, ComplexityTier }
export { coerceTier }

// =============================================================================
// Reportback parsing — pure function, kept in this file
// =============================================================================
//
// The reportback contract requires subagents to include `next_call` in
// their output. Subagents are LLMs, so the field will appear in free
// text in various shapes. We normalize via regex.

export type NextCallHint =
  | null
  | WorkerAgent
  | "ts-critic"
  | "c-critic"
  | "self"
  | "stop"

export type Reportback = {
  status: "done" | "blocker" | "need-info" | "rejected"
  nextCall: NextCallHint
  nextCallReason?: string
  unresolvedIssues: string[]
}

const NEXT_CALL_PATTERNS: Array<{ re: RegExp; map: (m: RegExpMatchArray) => NextCallHint }> = [
  { re: /next_call[\s:=-]+requirements[\s-]*analyst/i, map: () => "requirements-analyst" },
  { re: /next_call[\s:=-]+information[\s-]*collector/i, map: () => "information-collector" },
  { re: /next_call[\s:=-]+coder/i, map: () => "coder" },
  { re: /next_call[\s:=-]+ts[\s-]*critic/i, map: () => "ts-critic" },
  { re: /next_call[\s:=-]+c[\s-]*critic/i, map: () => "c-critic" },
  { re: /next_call[\s:=-]+self/i, map: () => "self" },
  { re: /next_call[\s:=-]+stop|next_call[\s:=-]+done/i, map: () => "stop" },
  { re: /next[\s_]*agent[\s:=-]+requirements[\s-]*analyst/i, map: () => "requirements-analyst" },
  { re: /next[\s_]*agent[\s:=-]+information[\s-]*collector/i, map: () => "information-collector" },
  { re: /next[\s_]*agent[\s:=-]+coder/i, map: () => "coder" },
]

const STATUS_PATTERNS: Array<{ re: RegExp; status: Reportback["status"] }> = [
  { re: /\bstatus[\s:=-]+blocker\b/i, status: "blocker" },
  { re: /\bstatus[\s:=-]+need[\s-]*info\b/i, status: "need-info" },
  { re: /\bstatus[\s:=-]+rejected\b/i, status: "rejected" },
  { re: /\bstatus[\s:=-]+done\b/i, status: "done" },
  { re: /\b(blocker|blocking)\b/i, status: "blocker" },
  { re: /\b(need[\s-]*info|need[\s-]*information)\b/i, status: "need-info" },
  { re: /\brejected\b/i, status: "rejected" },
]

export function parseReportback(rawText: string): Reportback {
  const text = rawText ?? ""

  let nextCall: NextCallHint = null
  for (const { re, map } of NEXT_CALL_PATTERNS) {
    const m = text.match(re)
    if (m) {
      nextCall = map(m)
      break
    }
  }

  let status: Reportback["status"] = "done"
  for (const { re, status: s } of STATUS_PATTERNS) {
    if (re.test(text)) {
      status = s
      break
    }
  }

  const unresolvedIssues: string[] = []
  const issueRe = /^(?:\s*[-*]\s*)?(?:unresolved|missing|blocker|gap)\b[^\n]{0,200}/gim
  let m: RegExpExecArray | null
  while ((m = issueRe.exec(text)) !== null) {
    unresolvedIssues.push(m[0].trim().slice(0, 180))
  }

  return { status, nextCall, unresolvedIssues }
}

// =============================================================================
// Worker progress tracking — per-session state, owned by this file
// =============================================================================
//
// Per-worker state: has the pre-review fired? has the worker itself
// reported back? has the post-review fired? This lives in module state
// because the G1 hook and the reportback parser both need it and they
// run in the same Node.js process.
//
// Resets on session start or on entering `init` / `loop-back`.

type WorkerProgress = {
  preReviewDone: boolean
  workerDone: boolean
  postReviewDone: boolean
}

const initialWorkerProgress = (): WorkerProgress => ({
  preReviewDone: false,
  workerDone: false,
  postReviewDone: false,
})

let workerProgress: Record<WorkerAgent, WorkerProgress> = {
  "requirements-analyst": initialWorkerProgress(),
  "information-collector": initialWorkerProgress(),
  coder: initialWorkerProgress(),
}

export function resetWorkerProgress(): void {
  workerProgress = {
    "requirements-analyst": initialWorkerProgress(),
    "information-collector": initialWorkerProgress(),
    coder: initialWorkerProgress(),
  }
}

export function requiresPreReview(agent: WorkerAgent): boolean {
  const p = workerProgress[agent]
  return !p.workerDone && !p.preReviewDone
}

export function isWorkerDone(agent: WorkerAgent): boolean {
  return workerProgress[agent].workerDone
}

export function isPostReviewDone(agent: WorkerAgent): boolean {
  return workerProgress[agent].postReviewDone
}

export function recordDispatch(agent: DispatchableAgent, phase: AionPhase): string {
  if (agent === "ts-critic") {
    if (phase === "gather" || phase === "loop-back") {
      if (!workerProgress["requirements-analyst"].workerDone) {
        workerProgress["requirements-analyst"].preReviewDone = true
        return "pre-review: requirements-analyst"
      }
      if (!workerProgress["information-collector"].workerDone) {
        workerProgress["information-collector"].preReviewDone = true
        return "pre-review: information-collector"
      }
    } else if (phase === "implement") {
      if (!workerProgress.coder.workerDone) {
        workerProgress.coder.preReviewDone = true
        return "pre-review: coder"
      }
    }
    if (phase === "ts-post-review") {
      workerProgress.coder.postReviewDone = true
      return "post-review: coder"
    }
    if (phase === "ts-pre-review") {
      workerProgress.coder.preReviewDone = true
      return "pre-review: coder (plan gate)"
    }
    return "ts-critic review recorded"
  }

  if (agent === "requirements-analyst" || agent === "information-collector" || agent === "coder") {
    workerProgress[agent].preReviewDone = true
    return "worker dispatched: " + agent
  }

  return "dispatch recorded: " + agent
}

export function recordWorkerDone(agent: WorkerAgent): void {
  workerProgress[agent].workerDone = true
}

export function debugState(): Record<WorkerAgent, WorkerProgress> {
  return JSON.parse(JSON.stringify(workerProgress))
}

// =============================================================================
// Backwards-compatible tier-defaulting wrappers
// =============================================================================
//
// The pre-refactor API took only (phase, agent). Existing tests and
// callers depend on that signature. These wrappers default to FULL —
// the historical behaviour — so old code keeps working without changes.
// New code should call dispatch-rules.ts directly with the tier.

const DEFAULT_TIER: ComplexityTier = "FULL"

export function isLegalDispatch(phase: AionPhase, agent: DispatchableAgent): boolean {
  return isLegalDispatchAt(DEFAULT_TIER, phase, agent)
}

export function legalDispatchesFrom(phase: AionPhase): string {
  return describeLegalDispatchesAt(DEFAULT_TIER, phase)
}

/**
 * Tier-aware variant of `legalDispatchesFrom`. Returns the array form
 * for callers that want to iterate. Returns `[]` for skipped phases
 * and terminal phases.
 */
export function legalDispatchesArrayFrom(tier: ComplexityTier, phase: AionPhase): readonly DispatchableAgent[] {
  return legalDispatchesAt(tier, phase) ?? []
}

export { nextPhaseAt } from "./dispatch-rules"

// =============================================================================
// Mermaid diagram — what gets injected into the system prompt
// =============================================================================
//
// Trimmed to the bare graph; explanations live in the prompts. This
// diagram is intentionally generic across tiers — the per-tier edge
// enforcement happens in tool-guard.ts at dispatch time, not via the
// diagram text.

export const SCHEDULING_MERMAID = "~~~mermaid\n" +
  "stateDiagram-v2\n" +
  "    [*] --> req_pre\n" +
  "    req_pre --> req: ts allow\n" +
  "    req --> req_post: worker done\n" +
  "    req_post --> info_pre: ts allow\n" +
  "    info_pre --> info: ts allow\n" +
  "    info --> info_post: worker done\n" +
  "    info_post --> coder_pre: ts allow\n" +
  "    coder_pre --> coder: ts allow\n" +
  "    coder --> coder_post: worker done\n" +
  "    coder_post --> c_critic: ts allow-stop\n" +
  "    c_critic --> [*]: approve-stop\n" +
  "    req_post --> req_pre: next_call=req\n" +
  "    info_post --> req_pre: next_call=req (contract gap)\n" +
  "    info_post --> info_pre: next_call=info\n" +
  "    coder_post --> coder_pre: next_call=coder\n" +
  "    coder_post --> info_pre: next_call=info (evidence gap)\n" +
  "    c_critic --> req_pre: reject-stop\n" +
  "~~~"