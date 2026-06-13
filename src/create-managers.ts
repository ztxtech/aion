import type { AionConfig } from "./config/types"
import type { PluginContext } from "./plugin/types"
import type { AionIntent } from "./hooks/types"
import { appendToFile, ensureDir } from "./shared/logger"
import { resolvePath, nowIso } from "./shared/utils"

export type RoundCounter = {
  current: number
  max: number
  delaySeconds: number
  enabled: boolean
}

export type AionPhase =
  | "init"
  | "gather"
  | "ts-pre-review"
  | "implement"
  | "ts-post-review"
  | "c-critic-final"
  | "loop-back"
  | "done"

export type GovernanceState = {
  stopSignal: "allow-stop" | "absolutely-cannot-stop-now" | "rebuttal-mode" | "rollback" | "unset"
  blockers: UnresolvedBlocker[]
  lastCCriticVerdict: "approve-stop" | "reject-stop" | "unset"
  lastTsCriticSignal: "allow-stop" | "absolutely-cannot-stop-now" | "rebuttal-mode" | "rollback" | "unset"
  phase: AionPhase
  phaseReason: string
  rebuttalMode: boolean
  visualTestLoopPending: boolean
  lastReadImageFile: string | null
  blindOptimismFlag: boolean
  lastDispatchTarget: string | null
  userContinueDecision: "continue" | "stop" | "unset"
  userComment: string | null
  userCheckedAt: string | null
  interactiveModeResolved: "unset" | "interactive" | "autonomous"
  interactiveModeConfirmedAt: string | null
  interactiveModeSource: "session-start" | "user-toggle" | "config-default" | null
  tuiTodoSyncPending: boolean
}

export type UnresolvedBlocker = {
  id: string
  source:
    | "ts-critic"
    | "c-critic"
    | "main-agent"
    | "information-collector"
    | "requirements-analyst"
    | "coder"
  description: string
  evidence: string
  forbiddenAction: string
  unblockCondition: string
  raisedAt: string
}

export type TraceEvent = {
  ts: string
  agent?: string
  type:
    | "dispatch.created"
    | "reportback.received"
    | "rebuttal.entered"
    | "stopgo.updated"
    | "completion-gate.refreshed"
    | "compaction.finished"
    | "plan.switched"
    | "branch.merged"
    | "governance.blocker"
    | "leakage.detected"
    | "dedup.rejected"
    | "memory.sync"
    | "ztxexp.run"
    | "ztxexp.validate"
    | "critic.review"
    | "critic.verdict"
    | "auto-continue"
    | "file.written"
  payload?: Record<string, unknown>
  message: string
}

export type BranchFrontier = {
  branchId: string
  wave: number
  status: "alive" | "merged" | "dropped" | "leading"
  currentValue: number
  evidenceCount: number
  startedAt: string
}

export type AionManagers = {
  ctx: PluginContext
  config: AionConfig
  state: {
    rounds: RoundCounter
    governance: GovernanceState
    branches: Map<string, BranchFrontier>
    _lastIntent?: string
    _lastSessionID?: string
  }
  trace: {
    append(event: Omit<TraceEvent, "ts">): void
    appendEvent(type: TraceEvent["type"], message: string, payload?: Record<string, unknown>, agent?: string): void
  }
  governance: {
    recordStopSignal(signal: GovernanceState["stopSignal"], source: string): void
    recordBlocker(blocker: Omit<UnresolvedBlocker, "id" | "raisedAt">): UnresolvedBlocker
    resolveBlocker(id: string): boolean
    hasOpenBlockers(): boolean
    listBlockers(): UnresolvedBlocker[]
    recordCCriticVerdict(verdict: GovernanceState["lastCCriticVerdict"]): void
  }
  userContinue: {
    record(decision: "continue" | "stop", comment: string | null): void
    reset(): void
  }
  interactiveMode: {
    isResolved(): boolean
    isInteractive(): boolean
    resolve(value: "interactive" | "autonomous", source: "session-start" | "user-toggle" | "config-default"): void
    reset(): void
  }
  phase: {
    current(): AionPhase
    transition(next: AionPhase, reason: string): void
    reset(): void
  }
  branches: {
    register(branchId: string, wave: number): BranchFrontier
    mark(branchId: string, status: BranchFrontier["status"]): void
    snapshot(): BranchFrontier[]
  }
  rounds: {
    next(): number
    remaining(): number
  }
  workspace: {
    tracePath(): string
    snapshotPath(): string
    memoryDir(): string
    todoMapPath(): string
    progressPath(): string
    completionGatePath(): string
    initialPromptPath(): string
  }
  git: {
    autoCommit(reason: string): void
  }
  enforce: {
    leakageCheck(filePath: string, content?: string): { safe: boolean; reason?: string }
  }
}

export type CreateManagersArgs = {
  ctx: PluginContext
  config: AionConfig
  onPhaseChange?: (prev: AionPhase, next: AionPhase, reason: string) => void
}

export function createAionManagers(args: CreateManagersArgs): AionManagers {
  const { ctx, config, onPhaseChange } = args

  const state: AionManagers["state"] = {
    rounds: {
      current: 0,
      max: config.autoContinue.maxRounds,
      delaySeconds: config.autoContinue.delaySeconds,
      enabled: config.autoContinue.enabled,
    },
    governance: {
      stopSignal: "unset",
      blockers: [],
      lastCCriticVerdict: "unset",
      lastTsCriticSignal: "unset",
      phase: "init" as AionPhase,
      phaseReason: "task started",
      rebuttalMode: false,
      visualTestLoopPending: false,
      lastReadImageFile: null,
      blindOptimismFlag: false,
      lastDispatchTarget: null,
      userContinueDecision: "unset",
      userComment: null,
      userCheckedAt: null,
      interactiveModeResolved: "unset",
      interactiveModeConfirmedAt: null,
      interactiveModeSource: null,
      tuiTodoSyncPending: false,
    },
    branches: new Map(),
    _lastIntent: "general",
    _lastSessionID: undefined,
  }

  const tracePathAbs = resolvePath(ctx.directory, config.trace.path)
  const snapshotPathAbs = resolvePath(ctx.directory, config.compaction.snapshotPath)
  const memoryDirAbs = resolvePath(ctx.directory, ".opencode/memory")
  const traceDirAbs = resolvePath(ctx.directory, ".opencode")

  const trace = {
    append(event: Omit<TraceEvent, "ts">): void {
      ensureDir(traceDirAbs)
      const fullEvent: TraceEvent = { ...event, ts: nowIso() }
      const line = `${fullEvent.ts} | ${fullEvent.type.padEnd(28)} | ${fullEvent.agent ?? "-"} | ${fullEvent.message}\n`
      appendToFile(tracePathAbs, line)
    },
    appendEvent(type: TraceEvent["type"], message: string, payload?: Record<string, unknown>, agent?: string): void {
      trace.append({ type, message, payload, agent })
    },
  }

  let blockerCounter = 0
  const governance = {
    recordStopSignal(signal: GovernanceState["stopSignal"], source: string): void {
      state.governance.stopSignal = signal
      if (source === "ts-critic") {
        state.governance.lastTsCriticSignal = signal
      } else if (source === "c-critic") {
        state.governance.lastCCriticVerdict =
          signal === "allow-stop" ? "approve-stop" : "reject-stop"
      }
      trace.appendEvent(
        "stopgo.updated",
        `stop signal = ${signal} (source: ${source})`,
        { signal, source },
        source,
      )
    },
    recordBlocker(b: Omit<UnresolvedBlocker, "id" | "raisedAt">): UnresolvedBlocker {
      blockerCounter += 1
      const blocker: UnresolvedBlocker = {
        ...b,
        id: `BLK-${blockerCounter.toString().padStart(3, "0")}`,
        raisedAt: nowIso(),
      }
      state.governance.blockers.push(blocker)
      trace.appendEvent(
        "governance.blocker",
        `[${blocker.id}] ${blocker.description}`,
        { ...blocker },
        b.source,
      )
      return blocker
    },
    resolveBlocker(id: string): boolean {
      const idx = state.governance.blockers.findIndex((x) => x.id === id)
      if (idx === -1) return false
      const [removed] = state.governance.blockers.splice(idx, 1)
      trace.appendEvent(
        "governance.blocker",
        `[${id}] resolved`,
        { id, description: removed.description },
        "main-agent",
      )
      return true
    },
    hasOpenBlockers(): boolean {
      return state.governance.blockers.length > 0
    },
    listBlockers(): UnresolvedBlocker[] {
      return [...state.governance.blockers]
    },
    recordCCriticVerdict(verdict: GovernanceState["lastCCriticVerdict"]): void {
      state.governance.lastCCriticVerdict = verdict
      trace.appendEvent(
        "critic.verdict",
        `c-critic verdict = ${verdict}`,
        { verdict },
        "c-critic",
      )
    },
  }

  const userContinue = {
    record(decision: "continue" | "stop", comment: string | null): void {
      state.governance.userContinueDecision = decision
      state.governance.userComment = comment
      state.governance.userCheckedAt = nowIso()
      trace.appendEvent(
        "stopgo.updated",
        `user continue decision = ${decision}${comment ? ` (comment: ${comment.slice(0, 100)})` : ""}`,
        { decision, comment: comment ?? undefined },
        "user",
      )
    },
    reset(): void {
      state.governance.userContinueDecision = "unset"
      state.governance.userComment = null
      state.governance.userCheckedAt = null
    },
  }

  const interactiveMode = {
    isResolved(): boolean {
      return state.governance.interactiveModeResolved !== "unset"
    },
    isInteractive(): boolean {
      // Runtime truth: if user resolved it, use their answer; otherwise fall back to config default.
      if (state.governance.interactiveModeResolved === "interactive") return true
      if (state.governance.interactiveModeResolved === "autonomous") return false
      return config.interactiveMode.enabled
    },
    resolve(value: "interactive" | "autonomous", source: "session-start" | "user-toggle" | "config-default"): void {
      state.governance.interactiveModeResolved = value
      state.governance.interactiveModeConfirmedAt = nowIso()
      state.governance.interactiveModeSource = source
      trace.appendEvent(
        "stopgo.updated",
        `interactive mode = ${value} (source: ${source})`,
        { mode: value, source },
        source === "user-toggle" ? "user" : "main-agent",
      )
    },
    reset(): void {
      state.governance.interactiveModeResolved = "unset"
      state.governance.interactiveModeConfirmedAt = null
      state.governance.interactiveModeSource = null
    },
  }

  const phaseManager = {
    current(): AionPhase {
      return state.governance.phase
    },
    transition(next: AionPhase, reason: string): void {
      const prev = state.governance.phase
      if (prev === next) return
      state.governance.phase = next
      state.governance.phaseReason = reason
      trace.appendEvent(
        "stopgo.updated",
        `phase transition: ${prev} → ${next} (${reason})`,
        { from: prev, to: next, reason },
        "main-agent",
      )
      try {
        onPhaseChange?.(prev, next, reason)
      } catch {
        // never let a listener break the phase machine
      }
    },
    reset(): void {
      state.governance.phase = "init"
      state.governance.phaseReason = "reset"
    },
  }

  const branches = {
    register(branchId: string, wave: number): BranchFrontier {
      const existing = state.branches.get(branchId)
      if (existing) return existing
      const branch: BranchFrontier = {
        branchId,
        wave,
        status: "alive",
        currentValue: 0,
        evidenceCount: 0,
        startedAt: nowIso(),
      }
      state.branches.set(branchId, branch)
      trace.appendEvent(
        "branch.merged",
        `registered branch ${branchId} wave=${wave}`,
        { branchId, wave },
      )
      return branch
    },
    mark(branchId: string, status: BranchFrontier["status"]): void {
      const branch = state.branches.get(branchId)
      if (!branch) return
      branch.status = status
      trace.appendEvent(
        "branch.merged",
        `branch ${branchId} -> ${status}`,
        { branchId, status },
      )
    },
    snapshot(): BranchFrontier[] {
      return [...state.branches.values()]
    },
  }

  const rounds = {
    next(): number {
      state.rounds.current += 1
      return state.rounds.current
    },
    remaining(): number {
      if (state.rounds.max <= 0) return Number.POSITIVE_INFINITY
      return Math.max(0, state.rounds.max - state.rounds.current)
    },
  }

  const workspace = {
    tracePath: () => tracePathAbs,
    snapshotPath: () => snapshotPathAbs,
    memoryDir: () => memoryDirAbs,
    todoMapPath: () => resolvePath(memoryDirAbs, "todo-map.md"),
    progressPath: () => resolvePath(memoryDirAbs, "progress.md"),
    completionGatePath: () => resolvePath(memoryDirAbs, "completion-gate.md"),
    initialPromptPath: () => resolvePath(memoryDirAbs, "initial-prompt.md"),
  }

  const git = {
    autoCommit(reason: string): void {
      try {
        const { execSync } = require("node:child_process") as typeof import("node:child_process")
        const cwd = ctx.directory
        execSync("git add -A", { cwd, stdio: "pipe", timeout: 10000 })
        const msg = `aion: ${reason} [phase=${state.governance.phase} round=${state.rounds.current}]`
        execSync(`git commit -m ${JSON.stringify(msg)} --allow-empty`, { cwd, stdio: "pipe", timeout: 10000 })
        trace.appendEvent("file.written", `git checkpoint: ${reason}`, { reason }, "main-agent")
      } catch {
        // git may not be initialized or no changes — silent
      }
    },
  }

  const enforce = {
    leakageCheck(filePath: string, content?: string): { safe: boolean; reason?: string } {
      const normalized = filePath.toLowerCase()

      if (config.leakage.blockCredentials) {
        if (/\.env($|\.)/.test(normalized) || /\/secrets?\//.test(normalized) || /\.(pem|key)$/i.test(normalized)) {
          return { safe: false, reason: "credentials / secret path access is blocked" }
        }
        if (content) {
          if (/AKIA[0-9A-Z]{16}/.test(content)) return { safe: false, reason: "AWS key-like content" }
          if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content))
            return { safe: false, reason: "private key block in content" }
        }
      }

      if (config.leakage.blockHiddenSetAccess) {
        if (/\/(test|val|holdout|hidden|private)\//.test(normalized) && /\.(csv|parquet|jsonl|tsv)$/i.test(normalized)) {
          return { safe: false, reason: "hidden-set / holdout data file access is blocked" }
        }
      }

      // NOTE: .opencode/memory/* and .opencode/trace.md are the SHARED CACHE and SHARED
      // EVENT BUS — all agents may read and write them. We do NOT block them here.
      // c-critic's minimal-context restriction is enforced in its prompt, not via this gate.
      if (config.leakage.blockPromptsAccess) {
        if (/\.opencode\/agents\//.test(normalized) && /\.(md|markdown)$/i.test(normalized)) {
          return { safe: false, reason: "internal AION agent prompt read is blocked (anti-extraction)" }
        }
      }

      return { safe: true }
    },
  }

  return {
    ctx,
    config,
    state,
    trace,
    governance,
    userContinue,
    interactiveMode,
    phase: phaseManager,
    branches,
    rounds,
    workspace,
    git,
    enforce,
  }
}

export const _testing = {
  DEFAULT_PHASE: "init" as AionPhase,
  PHASE_LIST: [
    "init",
    "gather",
    "ts-pre-review",
    "implement",
    "ts-post-review",
    "c-critic-final",
    "loop-back",
    "done",
  ] as readonly AionPhase[],
} as const
