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
import { notifyFromCtx } from "../shared/notify-tui"
import { existsSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

const LEAKAGE_PATH_PATTERNS: RegExp[] = [
  /\/\.env($|\.)/i,
  /\/secrets?\//i,
  /\.(pem|key)$/i,
  /\/(test|val|holdout|hidden|private)\//i,
  /\.(csv|parquet|jsonl|tsv)$/i,
  // NOTE: .opencode/agents/, .opencode/memory/*, and .opencode/trace.md are all SHARED
  // operational artifacts — all agents (main + subagents) may read and write them as
  // part of the shared-cache / shared-event-bus protocol. c-critic's minimal-context
  // restriction is enforced in its prompt, not via path blocking here.
]

const LEAKAGE_CONTENT_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /(password|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i,
]

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
])

const ZTXEXP_BOUNDARY_DIRS = new Set(["data", "evaluation", "exp", "model", "module", "scripts", "outputs"])

const AION_TEAM_TOOLS = new Set([
  "team_create",
  "team_delete",
  "team_status",
  "team_list",
  "team_send_message",
  "team_inbox",
  "team_inbox_ack",
  "team_shutdown_request",
  "team_approve_shutdown",
  "team_reject_shutdown",
  "team_task_create",
  "team_task_list",
  "team_task_get",
  "team_task_update",
])

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
        warn(`[aion] dedup: ${toolName} called with identical args ${now - last}ms ago — likely a no-op loop, but allowing to avoid triggering doom_loop protection. Move on to a different action.`, { tool: toolName })
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

    // === A. Visual semantic: image read tracking ===
    if (toolName === "read" || toolName === "Read" || toolName === "view") {
      const filePath = String((output as { args?: Record<string, unknown> }).args?.filePath ?? "")
      if (filePath) {
        for (const pat of LEAKAGE_PATH_PATTERNS) {
          if (pat.test(filePath)) {
            m.trace.appendEvent(
              "leakage.detected",
              `tool.execute.before blocked: ${toolName} ${filePath} matches ${pat}`,
              { tool: toolName, filePath, pattern: pat.source },
            )
            notifyFromCtx(m.ctx, {
              variant: "error",
              title: "Leakage block",
              message: `Refused to access ${filePath} (matches ${pat.source}). See trace for evidence.`,
              duration: 8000,
            })
            throw new Error(`[aion] leakage block: ${filePath} matches restricted pattern ${pat.source}`)
          }
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

        // Leakage path check
        for (const pat of LEAKAGE_PATH_PATTERNS) {
          if (pat.test(filePath)) {
            m.trace.appendEvent(
              "leakage.detected",
              `tool.execute.before blocked: ${toolName} ${filePath} matches ${pat}`,
              { tool: toolName, filePath, pattern: pat.source },
            )
            notifyFromCtx(m.ctx, {
              variant: "error",
              title: "Leakage block",
              message: `Refused to access ${filePath} (matches ${pat.source}). See trace for evidence.`,
              duration: 8000,
            })
            throw new Error(`[aion] leakage block: ${filePath} matches restricted pattern ${pat.source}`)
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
      // Leakage content check
      if (content) {
        for (const pat of LEAKAGE_CONTENT_PATTERNS) {
          if (pat.test(content)) {
            m.trace.appendEvent(
              "leakage.detected",
              `tool.execute.before blocked: ${toolName} content matches ${pat} (file=${filePath})`,
              { tool: toolName, filePath, pattern: pat.source },
            )
            notifyFromCtx(m.ctx, {
              variant: "error",
              title: "Leakage block: content",
              message: `Refused to write ${filePath || "<stdout>"} — content matches ${pat.source}. See trace for evidence.`,
              duration: 8000,
            })
            throw new Error(`[aion] leakage block: content matches restricted pattern ${pat.source}`)
          }
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
      const subagentType = String(taskArgs.subagent_type ?? taskArgs.description ?? "")
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
    }

    if (rawName.startsWith("aion_") && !AION_SAFETY_TOOLS.has(rawName)) {
      warn("[aion] tool.execute.before: unknown aion_* tool, allowing but logging", { tool: rawName })
    }

    if (rawName.startsWith("team_") && !AION_TEAM_TOOLS.has(rawName)) {
      warn("[aion] tool.execute.before: unknown team_* tool, allowing but logging", { tool: rawName })
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
        const subagentType = String(taskArgs.subagent_type ?? "")
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

    // === TUI TODO sync tracking: when aion_todo_update fires, set a flag so
    //     system-transform can inject a "call todowrite now" reminder on next round. ===
    if (toolName === "aion_todo_update") {
      m.state.governance.tuiTodoSyncPending = true
      m.trace.appendEvent(
        "memory.sync",
        `aion_todo_update fired — TUI sync pending (main agent must call todowrite)`,
        { tool: toolName },
        "main-agent",
      )
    }

    // === TUI TODO sync: when todowrite is called, clear the pending flag ===
    if (toolName === "todowrite" || toolName === "TodoWrite") {
      if (m.state.governance.tuiTodoSyncPending) {
        m.state.governance.tuiTodoSyncPending = false
        m.trace.appendEvent(
          "memory.sync",
          `TUI todo list synced via ${toolName}`,
          { tool: toolName },
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
