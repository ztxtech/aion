/**
 * `tool.execute.before` + `tool.execute.after` hooks — the guard layer.
 *
 * BEFORE (createToolGuardBeforeHook): runs before every tool call and
 * enforces hard safety gates:
 *   - Leakage guard: blocks credentials, hidden-set data, internal prompts
 *   - Path guard: blocks writes outside the workspace root
 *   - Git-push guard: blocks raw `git push` by subagents
 *   - Dedup guard: rejects repeated identical tool calls (doom-loop detection)
 *   - ztxexp boundary: ensures experiments run inside the sandboxed dir
 *
 * AFTER (createToolGuardAfterHook): runs after every tool call and handles
 * reactive bookkeeping:
 *   - Phase transitions inferred from tool-call patterns
 *   - Rebuttal / blind-optimism flagging from critic output
 *   - TUI TODO-sync tracking
 *   - Failure detection and tracing
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionToolExecuteBeforeHook, AionToolExecuteAfterHook } from "./types"
import { warn, info } from "../shared/logger"
import { nowIso } from "../shared/utils"
import { notifyFromCtx } from "../shared/notify-tui"
import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import {
  isLegalDispatch,
  legalDispatchesFrom,
  recordDispatch,
  requiresPreReview,
  parseReportback,
  recordWorkerDone,
  resetWorkerProgress,
  type DispatchableAgent,
  type WorkerAgent,
} from "../scheduling/state-machine"
import { isLegalDispatchAt } from "../scheduling/dispatch-rules"
import { coerceTier } from "../scheduling/complexity"

// All leakage pattern checks (path + content) are centralized in
// `managers.enforce.leakageCheck()` (see create-managers.ts). The hook here
// is a thin wrapper that calls that one source of truth — never maintain a
// parallel pattern list.
//
// Definition of "leakage" (single source of truth, see create-managers.ts):
//   Layer 1 — hard-coded (always on when the corresponding flag is true):
//     1. Credentials / secret paths: .env, /secrets/, .pem, .key
//     2. AWS key / private-key / password assignment in content
//     3. Internal AION agent prompts (.opencode/agents/*.md) — anti-extraction
//   Layer 2 — contract-driven (dataBoundaries in aion.jsonc, derived from the
//     task contract written by requirements-analyst):
//     4. forbiddenReads: glob patterns; matching a path blocks the read.
//     5. allowedReads: when NON-EMPTY, paths must match at least one pattern;
//        otherwise the read is blocked (allowlist mode).
//   Layer 3 (separate, not in this hook):
//     6. Project-root boundary: absolute paths outside cwd are blocked (line 222+).
//   Layer 4 (ts-critic submission review):
//     7. Submission column-name matching against the task spec's expected columns.
//     8. Training-pipeline import-graph analysis: any read/open that touches a
//        path matching dataBoundaries.forbiddenReads is a leakage verdict.
// Anything outside these layers is the user's own project data and must NOT
// be blocked at the hook level.

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|svg|bmp|webp|tiff?|pdf)$/i
const PLOT_OUTPUT_PATHS = /\/(outputs?|scripts\/plot|plots?|figures?|charts?)\//i

const HIGH_RISK_BASH_PATTERNS: RegExp[] = [
  /pip\s+install/i,
  /conda\s+(install|create|update)/i,
  /npm\s+install/i,
  /cargo\s+build/i,
  /make\s+/i,
  /python\s+.*\.py.*--(epochs|n_iter|num_train|batch)/i,
  /torch\./i,
  /sh\s+.*train/i,
  /bash\s+.*train/i,
]

// === Deduplication: prevent same tool with same args from being called twice in a short window ===
// Cache key = toolName + JSON.stringify(args). Value = timestamp of last call.
const recentCalls = new Map<string, number>()
const DEDUP_WINDOW_MS = 3000
let LAST_CLEANUP_MS = Date.now()
const CLEANUP_INTERVAL_MS = 30_000

const EARLY_STOP_WORDS = /\b(end\b|stop\b|wrap\s*up|delivery\s*complete|all\s*done|finished\s*everything|no\s*more\s*work|finalize\b|close\s*out|close\s*the?\s*task|task\s*complete|close\s*loop|complete\s*all|finish\s*up|finish\s*all|no\s*further\s*work|nothing\s*left|all\s*remaining\s*done|done\s*with\s*all|wrap\s*the\s*project)\b/i

const OVERCONFIDENT_PHRASES: RegExp[] = [
  /\bworks?\s*perfectly\b/i,
  /\bno\s*issues?\s*(at\s*all|whatsoever|found)\b/i,
  /\bgreat\s*results?\b/i,
  /\bexcellent\s*performance\b/i,
  /\bflawless\b/i,
  /\bguaranteed\s*to\s*work\b/i,
  /\b100%?\s*(accurate|correct|reliable)\b/i,
  /\bbulletproof\b/i,
  /\bno\s*(further|more)\s*(work|changes|improvements?|action)\s*(needed|required|necessary)\b/i,
]

const MEMORY_DIR_PATTERN = /\.opencode\/memory\//i

function normalizeToolName(name: string): string {
  let n = name
  if (n.startsWith("mcp_")) n = n.slice(4).replace(/_/g, "-")
  n = n.replace(/\0/g, "")
  if (n === "shell") n = "bash"
  if (n === "subagent") n = "task"
  return n
}

function findActiveZtxexpRoots(cwd: string): string[] {
  const expRoot = join(cwd, "exp")
  if (!existsSync(expRoot)) return []
  try {
    const { readdirSync } = require("node:fs") as typeof import("node:fs")
    const entries = readdirSync(expRoot, { withFileTypes: true })
    return entries
      .filter((d: import("node:fs").Dirent) => d.isDirectory() && existsSync(join(expRoot, d.name, ".ztxexp-manifest.json")))
      .map((d: import("node:fs").Dirent) => join(expRoot, d.name))
  } catch {
    return []
  }
}

function isInsideZtxexpBoundary(filePath: string, expRoot: string): { inside: boolean; boundaryDir: string | null } {
  const rel = relative(expRoot, filePath)
  if (rel.startsWith("..") || rel === filePath) return { inside: false, boundaryDir: null }
  const firstSegment = rel.split("/")[0] ?? ""
  if (ZTXEXP_BOUNDARY_DIRS.has(firstSegment)) return { inside: true, boundaryDir: firstSegment }
  if (firstSegment === "main.py" || firstSegment === "README.md" || firstSegment === ".ztxexp-manifest.json") return { inside: true, boundaryDir: null }
  return { inside: false, boundaryDir: null }
}

const AION_SAFETY_TOOLS = new Set([
  "aion_safety_gate",
  "aion_workspace_init",
  "aion_compaction",
  "aion_pre_stop_gate",
  "aion_memory_sync",
  "aion_critic_dispatch",
  "aion_critic_verdict",
  "aion_record_blocker",
  "aion_resolve_blocker",
  "aion_leakage_check",
  "aion_ztxexp_init",
  "aion_ztxexp_validate",
  "aion_ztxexp_run",
  "aion_todo_update",
  "aion_set_interactive_mode",
  "aion_set_language",
])

const ZTXEXP_BOUNDARY_DIRS = new Set(["data", "evaluation", "exp", "model", "module", "scripts", "outputs"])

export function createToolGuardBeforeHook(args: CreateHooksArgs): AionToolExecuteBeforeHook {
  const { managers } = args
  const m = managers

  return async function toolGuardBefore(input, output) {
    const rawName = input.tool
    const toolName = normalizeToolName(rawName)
    const cwd = m.ctx.directory

    // === Dedup: same tool + same args within DEDUP_WINDOW_MS is soft-warned (not blocked) ===
    // Blocking throws trigger OpenCode's doom_loop protection. Instead, we trace-warn
    // and let the call proceed — the dedup trace is enough signal for the main agent
    // to recognize the no-op and move on.
    {
      const toolArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      // Memory files (.opencode/memory/*.md) are persistent state stores that
      // are expected to be re-read across rounds and by multiple sub-agents
      // (e.g. information-collector re-checking negative.md for anti-patterns).
      // Skip dedup for them — re-reads are not a no-op loop signal.
      const toolFilePath = String(toolArgs.filePath ?? toolArgs.path ?? "")
      const isMemoryRead = (toolName === "read" || toolName === "Read" || toolName === "view")
        && MEMORY_DIR_PATTERN.test(toolFilePath)
      if (!isMemoryRead) {
        const key = `${toolName}::${JSON.stringify(toolArgs)}`
        const now = Date.now()
        const last = recentCalls.get(key)
        if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
          m.trace.appendEvent(
            "dedup.rejected",
            `tool.execute.before: ${toolName} called with same args within ${DEDUP_WINDOW_MS}ms (last: ${now - last}ms ago) — soft warn, allowing`,
            { tool: toolName, key, lastCallMs: now - last },
            "main-agent",
          )
          // Use info() instead of warn(): this is a soft hint to the LLM, not
          // a real error. warn() at console level makes the TUI flag the line
          // as an error, which misleads both human and LLM about severity.
          info(`[aion] dedup: ${toolName} called with identical args ${now - last}ms ago — likely a no-op loop, but allowing to avoid triggering doom_loop protection. Move on to a different action.`, { tool: toolName })
          // Do not throw — let the call proceed to avoid OpenCode's doom_loop escalation
        }
        recentCalls.set(key, now)
        // Periodic cleanup
        if (now - LAST_CLEANUP_MS > CLEANUP_INTERVAL_MS) {
          LAST_CLEANUP_MS = now
          for (const [k, t] of recentCalls) {
            if (now - t > DEDUP_WINDOW_MS * 2) recentCalls.delete(k)
          }
        }
      }
    }

    // === A. Visual semantic: image read tracking ===
    if (toolName === "read" || toolName === "Read" || toolName === "view") {
      const filePath = String((output as { args?: Record<string, unknown> }).args?.filePath ?? (output as { args?: Record<string, unknown> }).args?.path ?? "")
      if (filePath) {
        const verdict = m.enforce.leakageCheck(filePath)
        if (!verdict.safe) {
          m.trace.appendEvent(
            "leakage.detected",
            `tool.execute.before blocked: ${toolName} ${filePath} — ${verdict.reason}`,
            { tool: toolName, filePath, reason: verdict.reason },
          )
          notifyFromCtx(m.ctx, {
            variant: "error",
            title: "Leakage block",
            message: `Refused to access ${filePath} (${verdict.reason}). See trace for evidence.`,
            duration: 8000,
          })
          throw new Error(`[aion] leakage block: ${filePath} — ${verdict.reason}`)
        }
        if (IMAGE_EXTENSIONS.test(filePath)) {
          m.state.governance.lastReadImageFile = filePath
          m.trace.appendEvent("file.written", `image file read: ${filePath}`, { filePath, trigger: "visual-semantic" })
        }
      }
    }

    if (toolName === "write" || toolName === "Write" || toolName === "edit" || toolName === "Edit" || toolName === "apply_patch") {
      const toolArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const filePath = String(toolArgs.filePath ?? toolArgs.path ?? toolArgs.target ?? "")
      const content = String(toolArgs.content ?? toolArgs.new_string ?? toolArgs.body ?? "")
      if (filePath) {
        // Project-root boundary guard: writes must not target paths outside the project root
        if (filePath.startsWith("/")) {
          const rel = relative(cwd, filePath)
          if (rel.startsWith("..") || rel === filePath) {
            m.trace.appendEvent(
              "leakage.detected",
              `tool.execute.before blocked: ${toolName} target is outside project root: ${filePath}`,
              { tool: toolName, filePath, cwd },
            )
            throw new Error(`[aion] hard block: ${toolName} target "${filePath}" is outside the project root "${cwd}". Use relative paths only.`)
          }
        }

        // Leakage path + content check (delegated to enforce.leakageCheck — single source of truth)
        {
          const verdict = m.enforce.leakageCheck(filePath, content)
          if (!verdict.safe) {
            m.trace.appendEvent(
              "leakage.detected",
              `tool.execute.before blocked: ${toolName} ${filePath} — ${verdict.reason}`,
              { tool: toolName, filePath, reason: verdict.reason },
            )
            notifyFromCtx(m.ctx, {
              variant: "error",
              title: "Leakage block",
              message: `Refused to access ${filePath} (${verdict.reason}). See trace for evidence.`,
              duration: 8000,
            })
            throw new Error(`[aion] leakage block: ${filePath} — ${verdict.reason}`)
          }
        }

        // === F. Memory write guard: trace any write to .opencode/memory/ (all agents share it) ===
        if (MEMORY_DIR_PATTERN.test(filePath)) {
          const todoPath = m.workspace.todoMapPath()
          if (filePath === todoPath || filePath.endsWith("todo-map.md")) {
            // === J. TODO semantic check ===
            if (content && EARLY_STOP_WORDS.test(content)) {
              const matches = content.match(EARLY_STOP_WORDS)
              m.trace.appendEvent(
                "governance.blocker",
                `TODO early-stop smell detected in ${filePath}: "${matches?.[0]}"`,
                { filePath, matches },
                "main-agent",
              )
              notifyFromCtx(m.ctx, {
                variant: "error",
                title: "TODO early-stop blocked",
                message: `Refused to write ${filePath}: contains end/stop/done marker "${matches?.[0]}". TODOs must be scoped to concrete deliverables.`,
                duration: 8000,
              })
              throw new Error(`[aion] TODO semantic block: content contains early-stop marker "${matches?.[0]}". TODO items must be scoped to concrete deliverables, not end/stop/done markers.`)
            }
          }
          // Note: any agent is allowed to write to .opencode/memory/ via the write tool
          // (in addition to aion_memory_sync). This is the SHARED CACHE pattern.
          // The only hard-blocked artifact is todo-map.md (must go through aion_todo_update).
        }

        // === A. Visual semantic: writing image/plot files ===
        if (IMAGE_EXTENSIONS.test(filePath) || PLOT_OUTPUT_PATHS.test(filePath)) {
          m.state.governance.visualTestLoopPending = true
          m.trace.appendEvent(
            "file.written",
            `visual output written: ${filePath} — visual test loop now pending`,
            { filePath, trigger: "visual-semantic" },
          )
        }
      }

      // ztxexp boundary guard
      if (filePath && cwd) {
        const expRoots = findActiveZtxexpRoots(cwd)
        for (const expRoot of expRoots) {
          const absFilePath = filePath.startsWith("/") ? filePath : join(cwd, filePath)
          const relToRoot = relative(expRoot, absFilePath)
          if (relToRoot && !relToRoot.startsWith("..") && relToRoot !== absFilePath) {
            const { inside, boundaryDir } = isInsideZtxexpBoundary(absFilePath, expRoot)
            if (!inside) {
              const expId = expRoot.split("/").pop() ?? "unknown"
              // No console.warn — TUI toast is the only signal.
              notifyFromCtx(m.ctx, {
                variant: "warning",
                title: `ztxexp boundary: ${expId}`,
                message: `${filePath} is outside allowed dirs (data/ evaluation/ exp/ model/ module/ scripts/ outputs/). Move it under a boundary directory.`,
                duration: 7000,
              })
            }
          }
        }
      }
    }

    if (toolName === "bash" || toolName === "Bash") {
      const bashArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const command = String(bashArgs.command ?? bashArgs.cmd ?? "")
      if (command) {
        // Leakage block — only true info-leak patterns, NOT general file ops.
        // rm -rf is a normal dev command; only block it when targeting
        // catastrophic paths (root, home dir, or home subdir).
        if (/(rm\s+-rf?\s+\/(\s|$)|rm\s+-rf?\s+~(\/|\s|$)|rm\s+-rf?\s+\$\{?HOME\}?)/i.test(command) ||
            /(cat|cp|scp|curl)\s+.*\.env\b/i.test(command) ||
            /curl\s+.*credentials/i.test(command)) {
          m.trace.appendEvent(
            "leakage.detected",
            `tool.execute.before blocked: bash command contains suspicious token`,
            { tool: toolName, command: command.slice(0, 200) },
          )
          throw new Error(`[aion] leakage block: bash command contains restricted token`)
        }
        // Git push block
        if (/(git push|git remote add)/i.test(command)) {
          m.trace.appendEvent(
            "leakage.detected",
            `tool.execute.before blocked: git push / git remote add is not allowed by AION local-only rule`,
            { tool: toolName, command: command.slice(0, 200) },
          )
          throw new Error(`[aion] hard block: AION maintains a local-only git; git push / git remote add is forbidden`)
        }

        // === L. Safety gate: high-risk bash commands ===
        for (const pat of HIGH_RISK_BASH_PATTERNS) {
          if (pat.test(command)) {
            m.trace.appendEvent(
              "governance.blocker",
              `high-risk bash command detected — safety gate recommended`,
              { tool: toolName, command: command.slice(0, 200) },
            )
            break
          }
        }

        // Project-root boundary guard: mkdir must not create directories outside the project root
        if (cwd && /mkdir/i.test(command)) {
          const mkdirArgs = command.match(/mkdir\s+(?:-p\s+)?(?:--[^s]\s+)*([^\s;&|]+)/g)
          if (mkdirArgs) {
            for (const mArg of mkdirArgs) {
              const dirPath = mArg.replace(/mkdir\s+(?:-p\s+)?(?:--[^s]\s+)*/, "").trim()
              if (!dirPath) continue
              const absDir = dirPath.startsWith("/") ? dirPath : resolve(cwd, dirPath)
              const rel = relative(cwd, absDir)
              if (rel.startsWith("..") || rel === absDir) {
                m.trace.appendEvent(
                  "leakage.detected",
                  `tool.execute.before blocked: mkdir target is outside project root: ${dirPath}`,
                  { tool: toolName, command: command.slice(0, 200), absDir, cwd },
                )
                throw new Error(`[aion] hard block: mkdir target "${dirPath}" is outside the project root "${cwd}". Use relative paths only.`)
              }
            }
          }
        }

        // ztxexp mkdir boundary guard
        if (cwd && /mkdir/i.test(command)) {
          const expRoots = findActiveZtxexpRoots(cwd)
          const mkdirMatch = command.match(/mkdir\s+(?:-p\s+)?(?:--[^s]\s+)*([^\s;&|]+)/g)
          if (mkdirMatch && expRoots.length > 0) {
            for (const expRoot of expRoots) {
              const expId = expRoot.split("/").pop() ?? "unknown"
              for (const mArg of mkdirMatch) {
                const dirPath = mArg.replace(/mkdir\s+(?:-p\s+)?/, "").trim()
                const absDir = dirPath.startsWith("/") ? dirPath : join(cwd, dirPath)
                const rel = relative(expRoot, absDir)
                if (rel && !rel.startsWith("..") && rel !== absDir) {
                  const { inside } = isInsideZtxexpBoundary(absDir, expRoot)
                  if (!inside) {
                    // No console.warn — TUI toast is the only signal.
                    notifyFromCtx(m.ctx, {
                      variant: "warning",
                      title: `ztxexp boundary: ${expId}`,
                      message: `mkdir ${dirPath} is outside allowed dirs. Use data/ evaluation/ exp/ model/ module/ scripts/ or outputs/.`,
                      duration: 7000,
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    // === K. Context mode enforcement for task dispatch ===
    if (toolName === "task") {
      const taskArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const subagentType = String(taskArgs.agent ?? taskArgs.subagent_type ?? taskArgs.description ?? "")
      m.state.governance.lastDispatchTarget = subagentType || null
      const round = m.state.rounds.current
      if (round > 0 && subagentType && subagentType !== "c-critic") {
        const promptStr = String(taskArgs.prompt ?? "")
        if (!promptStr.includes("context-snapshot") && !promptStr.includes("compacted_context")) {
          // No console.warn — the TUI toast below is the only signal.
          // The m.trace.appendEvent for safety_gate/chat.message still records
          // this in the trace for postmortem, but we do NOT spam console.
          notifyFromCtx(m.ctx, {
            variant: "warning",
            title: `Dispatching ${subagentType} without context-snapshot`,
            message:
              "In round > 0 the dispatched prompt must reference context-snapshot or compacted_context, otherwise the subagent starts from stale state. Add the snapshot path to the dispatch prompt.",
            duration: 7000,
          })
        }
      }

      // === G1. Scheduling state-machine edge check (HARD GATE) ===
      // The serial-loop model requires dispatches to follow the tier-aware
      // state graph in src/scheduling/dispatch-rules.ts. Illegal edges throw
      // immediately; soft warnings were ignored in real runs.
      //
      // ESCALATION (R5 enforce): if a pending next_call has been ignored for
      // >= NEXT_CALL_IGNORE_THRESHOLD rounds (set in system-transform.ts),
      // we upgrade to a HARD throw — the only legal dispatch becomes the
      // requested agent. This forces compliance when soft warn fails.
      const NEXT_CALL_IGNORE_THRESHOLD = 2
      const pendingNextCall = m.state.governance.pendingNextCall
      const ignoredRounds = m.state.governance.pendingNextCallIgnoredRounds
      const isEscalated = pendingNextCall !== null && ignoredRounds >= NEXT_CALL_IGNORE_THRESHOLD
      if (isEscalated && subagentType !== pendingNextCall) {
        m.trace.appendEvent(
          "scheduling.dispatch",
          `G1 ESCALATED throw: main agent dispatching ${subagentType} but pending next_call=${pendingNextCall} has been ignored ${ignoredRounds + 1} rounds`,
          { phase: m.phase.current(), agent: subagentType, pendingNextCall, ignoredRounds },
          "main-agent",
        )
        throw new Error(
          `[aion] G1 escalation: a worker proposed next_call=${pendingNextCall} ${ignoredRounds + 1} rounds ago and you have not honored it. Dispatch ${pendingNextCall} (or ts-critic for its pre-review) now. No other dispatch is allowed until this is resolved.`,
        )
      }

      if (subagentType) {
        m.runtimeControl.refresh()
        const phase = m.phase.current()
        const agent = subagentType as DispatchableAgent
        // Tier-aware dispatch edge check. If the tier has not been set
        // yet (aion_set_complexity not yet called), fall back to FULL
        // for backward compatibility. This is the "safe" default —
        // refusing all dispatches would deadlock the session before the
        // main agent has a chance to classify.
        const classifiedTier = m.runtimeControl.effectiveTier()
        const effectiveTier = classifiedTier === "unset" ? "FULL" : classifiedTier
        const tier = effectiveTier
        const legal = isLegalDispatchAt(effectiveTier, phase, agent)

        // FORCE-ADVANCE: when ts-critic has returned allow-stop on a
        // contract review (gather/ts-pre-review/ts-post-review) and
        // the LLM tries to dispatch ts-critic again on the same
        // contract, reject the dispatch. The 2026-07-09 112252 run
        // got `allow-stop` 3 times in a row and stalled — the LLM
        // kept re-dispatching ts-critic because it was legal.
        //
        // This is a SOFT reject: the LLM gets an error message, not a
        // throw. The error says "the contract is approved, dispatch
        // coder or information-collector instead." The LLM can still
        // dispatch requirements-analyst for revisions if it has a
        // genuine reason (e.g. c-critic found a contract gap later).
        let forceAdvanceBlocked = false
        if (
          agent === "ts-critic" &&
          m.state.governance.lastTsCriticSignal === "allow-stop" &&
          (phase === "gather" || phase === "ts-pre-review" || phase === "ts-post-review")
        ) {
          forceAdvanceBlocked = true
        }

        const progressNote = recordDispatch(agent, phase)
        m.trace.appendEvent(
          "scheduling.dispatch",
          `G1 dispatch: tier=${effectiveTier} phase=${phase} agent=${agent} legal=${legal} forceAdvanceBlocked=${forceAdvanceBlocked} (${progressNote})`,
          { tier: effectiveTier, phase, agent, legal, forceAdvanceBlocked, progress: progressNote, round: m.state.rounds.current },
          "main-agent",
        )

        if (forceAdvanceBlocked) {
          const msg = `[aion] G1 force-advance: ts-critic already returned allow-stop on this contract (phase=${phase}). Re-dispatching ts-critic is rejected. Dispatch one of: coder (if contract is implementation-ready), information-collector (if you still need SOTA evidence), or requirements-analyst (if you have a genuine contract gap to fix). The contract-revision loop must end.`
          throw new Error(msg)
        }

        // If the main agent IS honoring the pending next_call, clear it.
        if (pendingNextCall && subagentType === pendingNextCall) {
          m.state.governance.pendingNextCall = null
          m.state.governance.pendingNextCallReason = null
          m.state.governance.pendingNextCallIgnoredRounds = 0
          m.state.governance.lastInjectedNextCall = null
          m.trace.appendEvent(
            "scheduling.dispatch",
            `G1: pending next_call=${pendingNextCall} honored and cleared`,
            { honoredAgent: pendingNextCall },
            "main-agent",
          )
        }

        if (!legal) {
          // `done` is a terminal phase with an empty legal-edges set. Any
          // dispatch from `done` means the main agent is ignoring c-critic's
          // approve-stop verdict and spinning — block HARD so the loop ends
          // instead of producing more orphan work.
          if (phase === "done") {
            const reason = `phase=done is terminal; c-critic has approved stop. You MUST NOT dispatch ${agent} (or any other agent) after closeout. Write the final summary and end the turn.`
            m.trace.appendEvent(
              "scheduling.dispatch",
              `G1 HARD throw: dispatch in terminal phase done agent=${agent}`,
              { phase, agent },
              "main-agent",
            )
            throw new Error(`[aion] ${reason}`)
          }
          // Pre-review gate: special-case for workers. Even if dispatch is
          // on a legal edge, a worker's FIRST dispatch requires a prior
          // ts-critic pre-review.
          let preReviewMissing = false
          if (agent === "requirements-analyst" || agent === "information-collector" || agent === "coder") {
            if (requiresPreReview(agent as WorkerAgent)) {
              preReviewMissing = true
            }
          }
          const reason = preReviewMissing
            ? `${agent} requires a ts-critic pre-review before its first dispatch. Dispatch ts-critic first.`
            : `${agent} is not on a legal edge from phase=${phase}. Legal: ${legalDispatchesFrom(phase)}`
          // G1 is a HARD GATE. A dispatch outside the legal-edge table is
          // always rejected — the table is the source of truth for what the
          // main agent may dispatch at each phase. Soft-warn-only was the
          // pre-refactor behavior; it was removed because the LLM ignored
          // warnings and dispatched illegally (see 2026-07-09 140933 run
          // where the main agent dispatched coder from gather phase 16 times
          // despite G1 warnings).
          m.trace.appendEvent(
            "scheduling.dispatch",
            `G1 HARD throw: illegal dispatch agent=${agent} phase=${phase}`,
            { phase, agent, reason },
            "main-agent",
          )
          throw new Error(`[aion] G1 hard-gate: ${reason}`)
        } else {
          // Edge is legal — but still check pre-review requirement for workers.
          if (agent === "requirements-analyst" || agent === "information-collector" || agent === "coder") {
            if (requiresPreReview(agent as WorkerAgent)) {
              m.trace.appendEvent(
                "scheduling.pre_review_missing",
                `G1 soft warn: ${agent} dispatched without pre-review (phase=${phase})`,
                { phase, agent },
                "main-agent",
              )
              notifyFromCtx(m.ctx, {
                variant: "warning",
                title: `Missing pre-review for ${agent}`,
                message: `The serial-loop contract requires ts-critic to review BEFORE ${agent}'s first dispatch. Consider dispatching ts-critic next round if you skipped it.`,
                duration: 7000,
              })
            }
          }
        }
      }
    }

      // === G2. Main-agent work-guard (TIER-AWARE) ===
    // The main agent's role is dispatch + integration + governance, NOT
    // implementation. Tier-aware rules:
    //
    //   LIGHT  - main agent may write to outputs/, docs/, *.md, *.txt,
    //            .opencode/memory/. Anything else (.py, .ts, .js, .csv,
    //            data files) -> throw [aion] main-agent-doing-coders-job.
    //            This is the "answer the question" tier; main agent
    //            is allowed to produce prose output but not code.
    //
    //   MEDIUM - main agent may dispatch task(coder) and write only
    //            .opencode/memory/. Project source files -> throw.
    //
    //   FULL   - same as MEDIUM. Worker agents (coder) write code;
    //            critic agents (ts-critic, c-critic) review.
    //
    // Why tier-aware: Karpathy's "Simplicity First" rule says "minimum
    // code that solves the problem". LIGHT tasks do not need coder
    // at all. MEDIUM/FULL tasks must not let the main agent
    // short-circuit coder via direct edits.
    //
    // Why throw (not soft warn): the previous soft-warn behaviour was
    // ignored in practice (see the 2026-07-08 unit-test run, where
    // the main agent edited 12 project files with only soft warns).
    // A throw is the only thing that makes the rule load-bearing.
    if (toolName === "write" || toolName === "Write" || toolName === "edit" || toolName === "Edit" || toolName === "apply_patch") {
      const toolArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const filePath = String(toolArgs.filePath ?? toolArgs.path ?? toolArgs.target ?? "")
      const tier = m.runtimeControl.effectiveTier()
      // Always allowed: orchestration files (.opencode/memory/, trace, todo-map).
      const isOrchestrationFile =
        filePath.includes(".opencode/memory/") ||
        filePath.endsWith("trace.md") ||
        filePath.endsWith("todo-map.md") ||
        filePath.endsWith("completion-gate.md")
      // Tier-conditional allowed:
      //   - LIGHT may also write prose outputs (*.md, *.txt, /outputs/, /docs/).
      //   - "unset" (tier not yet set) is permissive: we do not throw, just
      //     trace the event. Reason: the LLM has not had a chance to call
      //     aion_set_complexity yet. Throwing on round 1 would deadlock.
      //     Once the LLM classifies, the rule becomes load-bearing.
      const isLightProseOutput =
        tier === "LIGHT" &&
        (/\.(md|txt)$/i.test(filePath) ||
          filePath.includes("/outputs/") ||
          filePath.includes("/docs/") ||
          filePath.endsWith(".md"))
      const tierIsUnset = tier === "unset"
      if (!isOrchestrationFile && !isLightProseOutput && !tierIsUnset) {
        m.trace.appendEvent(
          "role.work_violation",
          `G2 throw: main agent editing project file ${filePath} - should dispatch coder (tier=${tier})`,
          { tool: toolName, filePath, tier },
          "main-agent",
        )
        notifyFromCtx(m.ctx, {
          variant: "error",
          title: "[BLOCKED] WRITE DENIED",
          message: `Editing ${filePath} at tier=${tier} is BLOCKED. Use task(subagent_type="coder", ...) instead. This is not a retryable failure.`,
          duration: 10000,
        })
        // G2 throw: main agent must not write project source files.
        // The [aion] prefix lets the G1 hook classify this as a tagged
        // governance error (re-thrown verbatim from tool-guard.ts).
        // G2 is a HARD GATE. The main agent must not write project
        // source files directly — that is coder's job. The error
        // message is designed to be clear even for lower-capability
        // models (see 2026-07-09 140933 run where qwen3.6-35b
        // retried 16 times despite a soft-sounding G2 error). The
        // [BLOCKED] prefix and the explicit "you cannot retry" are
        // there to prevent the retry loop.
        throw new Error(
          "[BLOCKED] WRITE IS PERMANENTLY DENIED at tier=" + tier +
          ". You CANNOT write to " + filePath + ". You CANNOT retry this. " +
          "Use task(subagent_type=\"coder\", description=\"...\", prompt=\"...\") " +
          "instead. The coder subagent has write access. The main agent does not. " +
          "If you cannot dispatch coder, do the work verbally (explain what to build) " +
          "in your text response and let the user take over."
        )
      }
    }
    if (toolName === "bash" || toolName === "Bash") {
      const bashArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const command = String(bashArgs.command ?? bashArgs.cmd ?? "")
      const tier = m.runtimeControl.effectiveTier()
      // Code-modifying bash patterns (sed/awk/cat<<EOF/redirect to source file).
      // Read-only commands (ls, cat for reading, grep, git status) are fine.
      const codeModifying =
        /\b(sed|awk|perl|python3?\s+-c)\b.*\s(-i|--in-place)\b/i.test(command) ||
        /cat\s+<<\s*(EOF|END|AION)/i.test(command) ||
        /\btee\b\s+/i.test(command) && /\.(ts|js|mjs|py|json|jsonc|md)$/i.test(command)
      if (codeModifying && tier !== "unset") {
        m.trace.appendEvent(
          "role.work_violation",
          `G2 output-block: main agent running code-modifying bash at tier=${tier} - output replaced`,
          { tool: toolName, command: command.slice(0, 200), tier },
          "main-agent",
        )
        // Replace the output with a BLOCKED message. The key insight:
        // tool.execute.before throw causes OpenCode to return "tool call
        // failed" which the LLM retries. Instead, we let the tool succeed
        // but replace the output with a BLOCKED message. The LLM sees a
        // successful tool call with blocked output — very different from
        // "tool call failed" — and is far less likely to retry.
        //
        // For weak models (qwen3.6-35b): "BLOCKED" is a clearer signal
        // than an exception, which it interprets as "try a different
        // command".
        // For strong models: the message already says to use task().
        ;(output as { output?: string }).output =
          "[BLOCKED] Code-modifying bash is not allowed at tier=" + tier + ". " +
          "The command was NOT executed. Use task(subagent_type=\"coder\", ...) for code work. " +
          "Do NOT retry with a different bash command."
        return
      }
    }

    if (rawName.startsWith("aion_") && !AION_SAFETY_TOOLS.has(rawName)) {
      warn("[aion] tool.execute.before: unknown aion_* tool, allowing but logging", { tool: rawName })
    }

    return
  }
}

export function createToolGuardAfterHook(args: CreateHooksArgs): AionToolExecuteAfterHook {
  const { managers, personality } = args
  const m = managers

  return async function toolGuardAfter(input, output) {
    const toolName = normalizeToolName(input.tool)
    const toolArgs = (output as { args?: Record<string, unknown> }).args ?? {}
    const outputText = String((output as { output?: string }).output ?? "")

    // Phase transitions from tool calls
    const prevPhase = m.phase.current()
    let nextPhase: import("../create-managers").AionPhase | null = null

    if (toolName === "aion_workspace_init" && prevPhase === "init") {
      nextPhase = "gather"
    } else if (toolName === "aion_critic_dispatch") {
      const critic = toolArgs.critic as string | undefined
      if (critic === "ts-critic" && prevPhase === "gather") {
        nextPhase = "ts-pre-review"
      } else if (critic === "ts-critic" && prevPhase === "implement") {
        nextPhase = "ts-post-review"
      }
    } else if (toolName === "aion_critic_verdict") {
      const verdict = toolArgs.verdict as string | undefined
      const critic = toolArgs.critic as string | undefined
      if (critic === "ts-critic") {
        if (verdict === "allow-stop" && prevPhase === "ts-pre-review") {
          nextPhase = "implement"
        } else if (verdict === "allow-stop" && prevPhase === "ts-post-review") {
          nextPhase = "c-critic-final"
        } else if ((verdict === "absolutely-cannot-stop-now" || verdict === "rebuttal-mode" || verdict === "rollback")) {
          if (prevPhase === "ts-pre-review") nextPhase = "gather"
          else if (prevPhase === "ts-post-review") nextPhase = "implement"
        }
      }
      if (critic === "c-critic") {
        if (verdict === "approve-stop") {
          nextPhase = "done"
        } else if (verdict === "reject-stop") {
          nextPhase = "loop-back"
        }
      }
    } else if (toolName === "aion_pre_stop_gate") {
      // handled by the tool itself
    }

    // === E. Rebuttal mode detection ===
    if (toolName === "aion_critic_verdict") {
      const verdict = toolArgs.verdict as string | undefined
      if (verdict === "rebuttal-mode" || verdict === "absolutely-cannot-stop-now") {
        m.state.governance.rebuttalMode = true
        m.trace.appendEvent(
          "rebuttal.entered",
          `rebuttal mode activated: verdict=${verdict}`,
          { verdict, critic: toolArgs.critic },
          "main-agent",
        )
      }
      if (verdict === "allow-stop" || verdict === "approve-stop") {
        m.state.governance.rebuttalMode = false
      }
    }

    // === H. Git checkpoint on phase transition ===
    if (nextPhase && nextPhase !== prevPhase) {
      m.phase.transition(nextPhase, `tool ${toolName} verdict=${(toolArgs.verdict ?? toolArgs.critic ?? "") as string}`)
      m.git.autoCommit(`phase transition ${prevPhase}→${nextPhase}`)
    }

    // === A. Visual semantic: after reading image, clear flag ===
    if ((toolName === "read" || toolName === "Read" || toolName === "view") && m.state.governance.lastReadImageFile) {
      // Flag stays set until system-transform picks it up
    }

    // === A. Visual semantic: writing image files marks visual loop pending ===
    // (already handled in before hook via state flag)

    // === F+G. Trace duplication removed ===
    // Memory sync, critic dispatch, and critic verdict are already traced inside
    // their respective tool execute() methods (memory.ts:90, critic.ts:37/146)
    // with the correct artifact/critic/verdict values. The after-hook context
    // loses toolArgs (they become undefined), so these duplicate traces always
    // showed "artifact=unknown" / "dispatched unknown" — pure noise. Removed.

    // === H. Personality: fire toasts on dispatch and critic events ===
    if (personality) {
      if (toolName === "task") {
        const taskArgs = (output as { args?: Record<string, unknown> }).args ?? {}
        const subagentType = String(taskArgs.agent ?? taskArgs.subagent_type ?? "")
        if (subagentType) {
          personality.onDispatch(subagentType)
        }
      }
      if (toolName === "aion_critic_verdict") {
        personality.onCriticVerdict(
          String(toolArgs.critic ?? ""),
          String(toolArgs.verdict ?? ""),
        )
      }
    }

    // === G3. Reportback protocol enforcement ===
    // Parse worker status, requested next_call, and unresolved issues into
    // persistent governance state for prompt injection and dispatch gating.
    if (toolName === "task" && outputText) {
      const taskArgs = (output as { args?: Record<string, unknown> }).args ?? {}
      const subagentType = String(taskArgs.agent ?? taskArgs.subagent_type ?? "")
      const isWorker =
        subagentType === "requirements-analyst" ||
        subagentType === "information-collector" ||
        subagentType === "coder"
      if (isWorker) {
        const rb = parseReportback(outputText)
        if (rb.status === "done") {
          recordWorkerDone(subagentType as WorkerAgent)
        }
        if (rb.nextCall !== null) {
          m.state.governance.pendingNextCall = String(rb.nextCall)
          m.state.governance.pendingNextCallReason = rb.nextCallReason ?? null
        }
        if (rb.unresolvedIssues.length > 0) {
          m.state.governance.pendingUnresolvedIssues = rb.unresolvedIssues
        }
        m.trace.appendEvent(
          "reportback.parsed",
          `G3 parsed ${subagentType} reportback: status=${rb.status}, nextCall=${rb.nextCall ?? "(none)"}, unresolved=${rb.unresolvedIssues.length}`,
          {
            agent: subagentType,
            status: rb.status,
            nextCall: rb.nextCall,
            unresolvedCount: rb.unresolvedIssues.length,
            unresolvedSample: rb.unresolvedIssues.slice(0, 3),
          },
          "main-agent",
        )
      }
    }

    if (toolName === "aion_pre_stop_gate") {
      m.trace.appendEvent(
        "completion-gate.refreshed",
        `pre-stop-gate executed: allowStop=${outputText.includes("allowStop")}`,
        { output: outputText.slice(0, 200) },
        "main-agent",
      )
    }
    if (toolName === "aion_compaction") {
      // already traced inside the tool
    }

    // === I. Blind optimism detection ===
    if (outputText) {
      for (const pat of OVERCONFIDENT_PHRASES) {
        if (pat.test(outputText)) {
          m.state.governance.blindOptimismFlag = true
          m.trace.appendEvent(
            "governance.blocker",
            `blind optimism detected in output: pattern="${pat.source}"`,
            { tool: toolName, pattern: pat.source },
            "main-agent",
          )
          break
        }
      }
    }

    // === G. Reportback detection (task returns) ===
    if (toolName === "task" && outputText) {
      m.trace.appendEvent(
        "reportback.received",
        `task returned (${(outputText || "").length} chars)`,
        { outputLength: outputText.length, target: m.state.governance.lastDispatchTarget },
        m.state.governance.lastDispatchTarget ?? "unknown",
      )
      // === Dynamic TODO update reminder ===
      const hasSuggestion = /(?:suggested[_-]?next[_-]?step|next[_-]?step|follow[_-]?up|remaining[_-]?gap|still[_-]?need|missing)/i.test(outputText)
      if (hasSuggestion) {
        m.trace.appendEvent(
          "memory.sync",
          `subagent reportback contains plan-expansion signals — call aion_todo_update(action="add-from-reportback")`,
          { source: m.state.governance.lastDispatchTarget },
          "main-agent",
        )
      }
    }

    // === Failure detection: log aion_* tool failures with full context ===
    if (toolName.startsWith("aion_") && outputText) {
      const failedMatch = /"status"\s*:\s*"(?:failed|error)"|"error"\s*:/i.exec(outputText)
      if (failedMatch) {
        m.trace.appendEvent(
          "governance.blocker",
          `${toolName} returned failure status`,
          { tool: toolName, args: toolArgs, outputHead: outputText.slice(0, 500) },
          "main-agent",
        )
      }
    }

    // === Personality: opportunity for heartbeat during long tool sequences ===
    personality?.onOpportunity()
  }
}

export const _testing = {
  AION_SAFETY_TOOLS,
} as const
