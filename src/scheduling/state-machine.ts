/**
 * Serial-loop scheduling state machine.
 *
 * Replaces the old "aggressive parallel fan-out" model with an explicit
 * directed graph: main chain is single-line (requirements → information →
 * coder), each worker agent is sandwiched between pre/post ts-critic reviews,
 * and only critics can produce stop signals. Back-edges are fired by the
 * main agent in response to a subagent's `next_call` reportback field.
 *
 * Three consumers:
 *   - G1 hook (tool-guard.ts: task dispatch edge check)
 *   - System prompt injection (system-transform.ts: Mermaid diagram)
 *   - Reportback protocol enforcement (next_call parser)
 *
 * Design decisions locked with the user:
 *   - ts-critic participates BEFORE and AFTER every worker subagent
 *   - main agent must NOT write code (soft warn, not hard block)
 *   - subagent may PROPOSE a new agent via next_call; MAIN agent decides
 *   - main agent carries unresolved issues forward to the next round
 */
import type { AionPhase } from "../create-managers"

// =============================================================================
// Types
// =============================================================================

/** Subagent roles that do actual work (critics are handled separately). */
export type WorkerAgent = "requirements-analyst" | "information-collector" | "coder"

/** All dispatchable subagent types. */
export type DispatchableAgent = WorkerAgent | "ts-critic" | "c-critic"

/** Reportback `next_call` field — the main agent's re-routing signal. */
export type NextCallHint =
  | null // no hint, follow default downstream
  | WorkerAgent // route to (or back to) a worker
  | "ts-critic" // route to a critic review
  | "c-critic" // route to the final gate
  | "self" // same agent, new focus
  | "stop" // worker thinks task might be done (only critics can confirm)

/** Parsed reportback payload. */
export type Reportback = {
  status: "done" | "blocker" | "need-info" | "rejected"
  nextCall: NextCallHint
  nextCallReason?: string
  unresolvedIssues: string[]
}

// =============================================================================
// Legal dispatch edges — the heart of the state machine
// =============================================================================
//
// Key = (current phase). Value = set of subagent_types that may be dispatched
// from this phase. Dispatching anything else is a G1 violation.
//
// Notes:
//   - The "gather" phase is overloaded: after init it means "requirements
//     not yet complete"; once requirements reports back, it means "pre-coder
//     information gathering". The edge set is the union.
//   - Worker self-loops (e.g. requirements → requirements) ARE legal: a
//     worker can be re-dispatched with deeper focus.
//   - Pre-review is implicit: before each worker dispatch in `gather` /
//     `implement`, the main agent should dispatch ts-critic first. We
//     enforce this via `requiresPreReview()` rather than via phase enum,
//     to avoid expanding AionPhase (which would cascade through every
//     Record<AionPhase, ...> in the codebase).

const LEGAL_EDGES: Record<AionPhase, Set<DispatchableAgent>> = {
  init: new Set<DispatchableAgent>(["requirements-analyst"]),
  gather: new Set<DispatchableAgent>([
    "requirements-analyst", // R5: may re-run with deeper focus
    "information-collector", // default downstream of requirements
    "ts-critic", // pre-review before either worker, post-review after either
    "coder", // only allowed if requirements AND information both reported done
  ]),
  "ts-pre-review": new Set<DispatchableAgent>(["ts-critic"]),
  implement: new Set<DispatchableAgent>([
    "coder", // main worker in this phase, self-loop allowed
    "ts-critic", // post-coder review
  ]),
  "ts-post-review": new Set<DispatchableAgent>(["ts-critic"]),
  "c-critic-final": new Set<DispatchableAgent>(["c-critic"]),
  "loop-back": new Set<DispatchableAgent>([
    "requirements-analyst", // c-critic rejected → restart contract
    "information-collector", // c-critic rejected with evidence gap
  ]),
  done: new Set<DispatchableAgent>(), // no further dispatch
}

/** Returns true iff dispatching `agent` from `phase` is on a legal edge. */
export function isLegalDispatch(phase: AionPhase, agent: DispatchableAgent): boolean {
  return LEGAL_EDGES[phase]?.has(agent) ?? false
}

/** Human-readable explanation of legal dispatches from this phase. */
export function legalDispatchesFrom(phase: AionPhase): string {
  const set = LEGAL_EDGES[phase]
  if (!set || set.size === 0) return "(none — terminal phase)"
  return Array.from(set).join(", ")
}

// =============================================================================
// Pre/post critic enforcement — "ts-critic participates around every worker"
// =============================================================================
//
// We track per-worker state: has the pre-review fired? has the worker itself
// reported back? has the post-review fired? This lives in module state (not
// AionPhase) so we don't have to expand the enum.
//
// Lifecycle:
//   reset on session start or on entering `init` / `loop-back`
//   pre-review fires when main agent dispatches ts-critic before a worker
//   worker fires when the worker itself is dispatched (we record its completion
//     via the post-dispatch hook + reportback parser)
//   post-review fires when main agent dispatches ts-critic after a worker
//
// The G1 hook checks: dispatching a worker is only allowed if either (a) the
// pre-review for that worker has fired, or (b) the worker has already run at
// least once (self-loop / deepening — pre-review only needed on first entry).

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

/** Returns true if this worker needs a pre-review before its first dispatch. */
export function requiresPreReview(agent: WorkerAgent): boolean {
  const p = workerProgress[agent]
  // Pre-review required on first entry; once worker has run, re-entry (self-loop)
  // does not need another pre-review, the existing review still covers it.
  return !p.workerDone && !p.preReviewDone
}

export function isWorkerDone(agent: WorkerAgent): boolean {
  return workerProgress[agent].workerDone
}

export function isPostReviewDone(agent: WorkerAgent): boolean {
  return workerProgress[agent].postReviewDone
}

/**
 * Record a dispatch event. Called by the G1 hook on every task / critic dispatch.
 * Returns a short status string for tracing.
 */
export function recordDispatch(
  agent: DispatchableAgent,
  phase: AionPhase,
): string {
  if (agent === "ts-critic") {
    // A ts-critic dispatch in gather/implement is the pre-review for whichever
    // worker is the next downstream. We mark pre-review for the first worker
    // that hasn't run yet (in main-chain order).
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
    // ts-post-review phase: post-review for coder
    if (phase === "ts-post-review") {
      workerProgress.coder.postReviewDone = true
      return "post-review: coder"
    }
    // ts-pre-review phase: pre-review for coder (between info and coder)
    if (phase === "ts-pre-review") {
      workerProgress.coder.preReviewDone = true
      return "pre-review: coder (plan gate)"
    }
    return "ts-critic review recorded"
  }

  if (agent === "requirements-analyst" || agent === "information-collector" || agent === "coder") {
    // Marking workerDone happens on reportback, not on dispatch. But we can
    // already note that a pre-review is no longer blocking (the dispatch
    // happened, so either pre-review fired or the main agent bypassed it —
    // the G1 hook will flag the latter separately).
    workerProgress[agent].preReviewDone = true
    return `worker dispatched: ${agent}`
  }

  return `dispatch recorded: ${agent}`
}

/** Mark a worker as having reported back done. Called by reportback parser. */
export function recordWorkerDone(agent: WorkerAgent): void {
  workerProgress[agent].workerDone = true
}

// =============================================================================
// Reportback parsing — extract next_call from subagent free-text output
// =============================================================================
//
// The reportback contract (governance.ts:102) requires subagents to include
// `next_call` in their output. Subagents are LLMs, so the field will appear
// in free text in various shapes. We normalize via regex.

const NEXT_CALL_PATTERNS: Array<{ re: RegExp; map: (m: RegExpMatchArray) => NextCallHint }> = [
  { re: /next_call[\s:=-]+requirements[\s-]*analyst/i, map: () => "requirements-analyst" },
  { re: /next_call[\s:=-]+information[\s-]*collector/i, map: () => "information-collector" },
  { re: /next_call[\s:=-]+coder/i, map: () => "coder" },
  { re: /next_call[\s:=-]+ts[\s-]*critic/i, map: () => "ts-critic" },
  { re: /next_call[\s:=-]+c[\s-]*critic/i, map: () => "c-critic" },
  { re: /next_call[\s:=-]+self/i, map: () => "self" },
  { re: /next_call[\s:=-]+stop|next_call[\s:=-]+done/i, map: () => "stop" },
  { re: /next[\s:_-]*agent[\s:=-]+requirements[\s-]*analyst/i, map: () => "requirements-analyst" },
  { re: /next[\s:_-]*agent[\s:=-]+information[\s-]*collector/i, map: () => "information-collector" },
  { re: /next[\s:_-]*agent[\s:=-]+coder/i, map: () => "coder" },
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

  // Extract any "unresolved" / "missing" / "blocker:" lines as issues.
  const unresolvedIssues: string[] = []
  const issueRe = /^(?:\s*[-*]\s*)?(?:unresolved|missing|blocker|gap)\b[^\n]{0,200}/gim
  let m: RegExpExecArray | null
  while ((m = issueRe.exec(text)) !== null) {
    unresolvedIssues.push(m[0].trim().slice(0, 180))
  }

  return { status, nextCall, unresolvedIssues }
}

// =============================================================================
// Mermaid diagram — injected into the system prompt
// =============================================================================
//
// Human-readable form (kept here as a comment for developers; not injected):
//
//   init → [workspace_init + memory_sync]
//     ↓
//   [ts-critic: pre-requirements] → [requirements-analyst] → [ts-critic: post-requirements]
//     ↓ (or back-edge if next_call=requirements)
//   [ts-critic: pre-information]  → [information-collector] → [ts-critic: post-information]
//     ↓ (or back-edge to requirements if contract gap)
//   [ts-critic: pre-coder]        → [coder] → [ts-critic: post-coder]
//     ↓ (or back-edge to coder/information on rebuttal)
//   [c-critic] → (approve → done | reject → back to requirements)
//
// Machine form (Mermaid, what actually gets injected):
//   - trimmed to the bare graph; explanations live in the prompts.
//   - G1 hook backs it up with hard edge checks.

export const SCHEDULING_MERMAID = `~~~mermaid
stateDiagram-v2
    [*] --> req_pre
    req_pre --> req: ts allow
    req --> req_post: worker done
    req_post --> info_pre: ts allow
    info_pre --> info: ts allow
    info --> info_post: worker done
    info_post --> coder_pre: ts allow
    coder_pre --> coder: ts allow
    coder --> coder_post: worker done
    coder_post --> c_critic: ts allow-stop
    c_critic --> [*]: approve-stop
    req_post --> req_pre: next_call=req
    info_post --> req_pre: next_call=req (contract gap)
    info_post --> info_pre: next_call=info
    coder_post --> coder_pre: next_call=coder
    coder_post --> info_pre: next_call=info (evidence gap)
    c_critic --> req_pre: reject-stop
~~~`

// =============================================================================
// Self-test helper (used by tests + by the G1 hook for diagnostics)
// =============================================================================

export function debugState(): Record<WorkerAgent, WorkerProgress> {
  return JSON.parse(JSON.stringify(workerProgress))
}
