/**
 * Central state factory and the type hub for the entire AION runtime.
 *
 * This module owns:
 *   - All shared AION types: {@link AionPhase} (the lifecycle state machine),
 *     {@link GovernanceState} (stop-go / blockers / interactive mode),
 *     {@link TraceEvent}, {@link BranchFrontier}, {@link RoundCounter}.
 *   - The {@link AionManagers} bag — a collection of small focused managers
 *     built once at plugin load and shared by every hook and tool:
 *       • state   – mutable in-memory runtime state
 *       • trace   – append-only event log (.opencode/trace.md)
 *       • governance – stop-signal + blocker registry
 *       • userContinue / interactiveMode – user-decision tracking
 *       • phase   – the init→gather→…→done transition machine
 *       • branches / rounds – experiment-branch frontier + auto-continue counter
 *       • workspace – resolved absolute paths for all AION artifacts
 *       • git / enforce – checkpoint commits + leakage gate
 *
 * Nothing here touches the network or the LLM; it is pure bookkeeping.
 */
import type { AionConfig } from "./config/types"
import type { PluginContext } from "./plugin/types"
import type { AionIntent } from "./hooks/types"
import { appendToFile, ensureDir } from "./shared/logger"
import { resolvePath, nowIso } from "./shared/utils"
import {
  effectiveComplexityTier,
  readRuntimeState,
  sessionRuntimeState,
  runtimeStatePath,
  updateRuntimeState,
  updateSessionRuntimeState,
  updateSessionTaskState,
  activateFrontierState,
  applyFrontierReport,
  advanceFrontierState,
  defaultFrontierState,
  resetFrontierState,
  type ExecutionMode,
  type FrontierReport,
  type FrontierReportResult,
  type FrontierState,
  type TaskKeeperState,
} from "./shared/runtime-control"

// matchGlob — minimal glob matcher supporting `*` (any chars except `/`),
// `**` (any chars including `/`), and `?` (single char). Used by the contract-
// driven leakage gate (dataBoundaries.forbiddenReads / allowedReads). No
// external deps; the patterns in aion.jsonc are simple enough.
function matchGlob(pattern: string, path: string): boolean {
  const p = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "§§").replace(/\*/g, "[^/]*").replace(/§§/g, ".*").replace(/\?/g, "[^/]")
  const re = new RegExp(`^${p}$`)
  return re.test(path)
}

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
  interactiveModeGranularity: "autonomous" | "round-checkpoint" | "always-interactive" | "custom"
  interactiveModeCustomTriggers: string[]
  interactiveModeConfirmedAt: string | null
  interactiveModeSource: "session-start" | "user-toggle" | "config-default" | null
  languageResolved: "unset" | "en" | "zh-reason-en-deliver" | "zh-deliver" | "bilingual"
  languageSource: "session-start" | "user-toggle" | "config-default" | null
  /** G3: pending next_call from the most recent worker reportback. The main agent MUST honor this on the next dispatch. */
  pendingNextCall: string | null
  /** G3: reason attached to the pending next_call (for trace + prompt injection). */
  pendingNextCallReason: string | null
  /** G3: unresolved issues from the most recent reportback that must be carried into the next round. */
  pendingUnresolvedIssues: string[]
  /** G3 escalation: how many consecutive rounds a pending next_call has been injected but ignored. Above threshold, G1 hook upgrades to throw. */
  pendingNextCallIgnoredRounds: number
  /** G3 escalation: the value of pendingNextCall that is being ignored, so the counter persists across the one-shot clear. */
  lastInjectedNextCall: string | null
  /** Most recent aion_pre_stop_gate verdict. null until the gate runs at least once. The c-critic approve-stop path requires this to be allowStop=true. */
  lastPreStopGate: { allowStop: boolean; blockers: string[]; recordedAt: string } | null
  /**
   * Recorded task complexity tier. "unset" until aion_set_complexity is
   * called for the first time. After that it is one of LIGHT / MEDIUM / FULL
   * and can only escalate (LIGHT -> MEDIUM -> FULL), never de-escalate.
   */
  complexityTier: "unset" | "LIGHT" | "MEDIUM" | "FULL"
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
    | "hf.search"
    | "hf.info"
    | "hf.ingest"
    | "no-progress.breaker"
    | "hf.suggest"
    | "scheduling.dispatch"
    | "scheduling.pre_review_missing"
    | "role.work_violation"
    | "reportback.parsed"
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
    recordPreStopGate(allowStop: boolean, blockers: string[]): void
    getLastPreStopGate(): GovernanceState["lastPreStopGate"]
  }
  userContinue: {
    record(decision: "continue" | "stop", comment: string | null): void
    reset(): void
  }
  interactiveMode: {
    isResolved(): boolean
    isInteractive(): boolean
    getGranularity(): "autonomous" | "round-checkpoint" | "always-interactive" | "custom"
    getCustomTriggers(): string[]
    shouldPauseAt(trigger: "c-critic-verdict" | "dispatch" | "plan-switch" | "phase-transition" | "critic-reject"): boolean
    resolve(
      value: "interactive" | "autonomous",
      source: "session-start" | "user-toggle" | "config-default",
      options?: { granularity?: "autonomous" | "round-checkpoint" | "always-interactive" | "custom"; customTriggers?: string[] },
    ): void
    reset(): void
  }
  language: {
    isResolved(): boolean
    getMode(): "en" | "zh-reason-en-deliver" | "zh-deliver" | "bilingual"
    resolve(
      mode: "en" | "zh-reason-en-deliver" | "zh-deliver" | "bilingual",
      source: "session-start" | "user-toggle" | "config-default",
    ): void
    reset(): void
  }
  /**
   * Task complexity tier facade. Records the current tier and exposes
   * a getter. Escalation policy (LIGHT -> MEDIUM -> FULL, no
   * de-escalation) is enforced inside the aion_set_complexity tool,
   * not here, so this facade is read-only.
   */
  complexity: {
    /** Returns the current tier, or "unset" if aion_set_complexity has not run. */
    current(): "unset" | "LIGHT" | "MEDIUM" | "FULL"
    /** Internal setter used by aion_set_complexity. Not for hook callers. */
    setTier(tier: "LIGHT" | "MEDIUM" | "FULL"): void
    /** True iff the tier has been recorded at least once. */
    isSet(): boolean
  }
  runtimeControl: {
    withSession<T>(sessionID: string | undefined, operation: () => Promise<T> | T): Promise<T>
    current(): ExecutionMode
    effectiveTier(): "unset" | "LIGHT" | "MEDIUM" | "FULL"
    setMode(mode: ExecutionMode, source: "user-toggle" | "startup"): void
    refresh(): void
    activateSession(sessionID: string): void
    currentSession(): string | null
    setSessionComplexityTier(tier: "LIGHT" | "MEDIUM" | "FULL"): void
    markPhase(phase: AionPhase, reason: string): void
    markInterrupted(reason: string, interrupt?: boolean): void
    clearResume(): void
    checkpoint(taskPatch?: Partial<TaskKeeperState>): void
    reserveContinuation(sessionID: string, eventID?: string): void
    recordContinuation(sessionID: string, eventID?: string): void
    releaseContinuation(sessionID: string, eventID?: string): void
    taskState(): TaskKeeperState
    frontierState(): FrontierState
    activateFrontier(): FrontierState
    resetFrontier(): FrontierState
    reportFrontier(report: FrontierReport): FrontierReportResult
    advanceFrontier(threshold: number): FrontierState
    setExternalGoalStatus(status: TaskKeeperState["externalGoalStatus"]): void
    resumeContext(): {
      lastPhase: AionPhase | null
      resumeHint: string | null
      interrupted: boolean
    }
    path(): string
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

function createDefaultGovernanceState(): GovernanceState {
  return {
    stopSignal: "unset",
    blockers: [],
    lastCCriticVerdict: "unset",
    lastTsCriticSignal: "unset",
    phase: "init",
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
    interactiveModeGranularity: "autonomous",
    interactiveModeCustomTriggers: [],
    interactiveModeConfirmedAt: null,
    interactiveModeSource: null,
    languageResolved: "unset",
    languageSource: null,
    pendingNextCall: null,
    pendingNextCallReason: null,
    pendingUnresolvedIssues: [],
    pendingNextCallIgnoredRounds: 0,
    lastInjectedNextCall: null,
    lastPreStopGate: null,
    complexityTier: "unset",
  }
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
    governance: createDefaultGovernanceState(),
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
      runtimeControl.checkpoint()
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
      runtimeControl.checkpoint()
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
      runtimeControl.checkpoint()
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
      runtimeControl.checkpoint()
      // Note: trace event is emitted by the caller (src/tools/critic.ts:195)
      // so we do not double-emit here. Keeping this setter pure-state
      // makes the trace event source single and easier to read.
    },
    recordPreStopGate(allowStop: boolean, blockers: string[]): void {
      state.governance.lastPreStopGate = {
        allowStop,
        blockers: [...blockers],
        recordedAt: nowIso(),
      }
      runtimeControl.checkpoint()
    },
    getLastPreStopGate(): GovernanceState["lastPreStopGate"] {
      return state.governance.lastPreStopGate
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
    getGranularity(): "autonomous" | "round-checkpoint" | "always-interactive" | "custom" {
      return state.governance.interactiveModeGranularity
    },
    getCustomTriggers(): string[] {
      return state.governance.interactiveModeCustomTriggers
    },
    shouldPauseAt(trigger: "c-critic-verdict" | "dispatch" | "plan-switch" | "phase-transition" | "critic-reject"): boolean {
      const g = state.governance.interactiveModeGranularity
      if (g === "autonomous") return false
      if (g === "always-interactive") return true
      if (g === "round-checkpoint") return trigger === "c-critic-verdict"
      if (g === "custom") {
        return state.governance.interactiveModeCustomTriggers.includes(trigger)
      }
      return false
    },
    resolve(
      value: "interactive" | "autonomous",
      source: "session-start" | "user-toggle" | "config-default",
      options?: { granularity?: "autonomous" | "round-checkpoint" | "always-interactive" | "custom"; customTriggers?: string[] },
    ): void {
      state.governance.interactiveModeResolved = value
      state.governance.interactiveModeConfirmedAt = nowIso()
      state.governance.interactiveModeSource = source
      if (options?.granularity) {
        state.governance.interactiveModeGranularity = options.granularity
      } else if (value === "autonomous") {
        state.governance.interactiveModeGranularity = "autonomous"
      } else {
        state.governance.interactiveModeGranularity = "round-checkpoint"
      }
      if (options?.customTriggers) {
        state.governance.interactiveModeCustomTriggers = options.customTriggers
      }
      trace.appendEvent(
        "stopgo.updated",
        `interactive mode = ${value} (source: ${source}, granularity: ${state.governance.interactiveModeGranularity})`,
        { mode: value, source, granularity: state.governance.interactiveModeGranularity, customTriggers: state.governance.interactiveModeCustomTriggers },
        source === "user-toggle" ? "user" : "main-agent",
      )
    },
    reset(): void {
      state.governance.interactiveModeResolved = "unset"
      state.governance.interactiveModeGranularity = "autonomous"
      state.governance.interactiveModeCustomTriggers = []
      state.governance.interactiveModeConfirmedAt = null
      state.governance.interactiveModeSource = null
    },
  }

  const languageManager = {
    isResolved(): boolean {
      return state.governance.languageResolved !== "unset"
    },
    getMode(): "en" | "zh-reason-en-deliver" | "zh-deliver" | "bilingual" {
      if (state.governance.languageResolved !== "unset") return state.governance.languageResolved
      return config.language?.mode ?? "en"
    },
    resolve(
      mode: "en" | "zh-reason-en-deliver" | "zh-deliver" | "bilingual",
      source: "session-start" | "user-toggle" | "config-default",
    ): void {
      state.governance.languageResolved = mode
      state.governance.languageSource = source
      trace.appendEvent(
        "stopgo.updated",
        `language = ${mode} (source: ${source})`,
        { mode, source },
        source === "user-toggle" ? "user" : "main-agent",
      )
    },
    reset(): void {
      state.governance.languageResolved = "unset"
      state.governance.languageSource = null
    },
  }

  /**
   * Task complexity tier facade. The setter is intentionally narrow —
   * it only updates state and emits a trace event. Escalation policy
   * (LIGHT -> MEDIUM -> FULL, no de-escalation) lives in the
   * aion_set_complexity tool, not here.
   */
  const complexityManager = {
    current(): "unset" | "LIGHT" | "MEDIUM" | "FULL" {
      return state.governance.complexityTier
    },
    setTier(tier: "LIGHT" | "MEDIUM" | "FULL"): void {
      state.governance.complexityTier = tier
      runtimeControl.setSessionComplexityTier(tier)
      trace.appendEvent(
        "dispatch.created",
        "complexity.tier set: " + tier,
        { tier },
        "main-agent",
      )
    },
    isSet(): boolean {
      return state.governance.complexityTier !== "unset"
    },
  }

  let runtimeState = readRuntimeState(ctx.directory)
  const startupSessionID = runtimeState.activeSessionID
  if (startupSessionID) {
    const startupSession = sessionRuntimeState(runtimeState, startupSessionID)
    if (
      runtimeState.preferences.preserveAcrossSessions &&
      startupSession?.lastPhase &&
      startupSession.lastPhase !== "done" &&
      !startupSession.interrupted
    ) {
      runtimeState = updateSessionRuntimeState(ctx.directory, startupSessionID, {
        interrupted: true,
        resumeHint: `Review .opencode/memory/todo-map.md and .opencode/memory/progress.md, then resume from ${startupSession.lastPhase}.`,
      })
    }
  }

  let operationTail: Promise<void> = Promise.resolve()
  const runtimeControl = {
    withSession<T>(sessionID: string | undefined, operation: () => Promise<T> | T): Promise<T> {
      const run = async () => {
        if (sessionID) runtimeControl.activateSession(sessionID)
        return await operation()
      }
      const result = operationTail.then(run, run)
      operationTail = result.then(() => undefined, () => undefined)
      return result
    },
    current(): ExecutionMode {
      return runtimeState.executionMode
    },
    effectiveTier(): "unset" | "LIGHT" | "MEDIUM" | "FULL" {
      return effectiveComplexityTier(
        runtimeState.executionMode,
        state.governance.complexityTier,
      )
    },
    setMode(mode: ExecutionMode, source: "user-toggle" | "startup"): void {
      const previous = runtimeState.executionMode
      runtimeState = updateRuntimeState(ctx.directory, {
        executionMode: mode,
      })
      trace.appendEvent(
        "stopgo.updated",
        `execution mode: ${previous} -> ${mode} (source: ${source})`,
        { previous, mode, source },
        source === "user-toggle" ? "user" : "system",
      )
    },
    refresh(): void {
      runtimeState = readRuntimeState(ctx.directory)
    },

    activateSession(sessionID: string): void {
      const previousID = activeSessionActivated ? activeRuntimeSessionID : runtimeState.activeSessionID
      if (activeSessionActivated && previousID === sessionID) return

      if (activeSessionActivated && previousID && previousID !== sessionID) {
        checkpointRuntimeState()
      }

      runtimeState = updateRuntimeState(ctx.directory, { activeSessionID: sessionID })
      activeRuntimeSessionID = sessionID
      activeSessionActivated = true
      const session = sessionRuntimeState(runtimeState, sessionID)
      state.governance.phase = session?.lastPhase ?? "init"
      state.governance.phaseReason = session?.phaseReason ?? "new runtime session"
      state.governance.complexityTier = session?.complexityTier ?? "unset"
      state.rounds.current = session?.rounds.current ?? 0
      state.rounds.max = session?.rounds.max ?? state.rounds.max
      state.branches = new Map((session?.branches ?? []).map((branch) => [branch.branchId, { ...branch }]))
      state._lastIntent = session?.intent ?? "general"
      const defaults = createDefaultGovernanceState()
      const governance = session?.governance
      state.governance = {
        ...defaults,
        phase: state.governance.phase,
        phaseReason: state.governance.phaseReason,
        complexityTier: state.governance.complexityTier,
        ...(governance ? {
          stopSignal: governance.stopSignal,
          blockers: governance.blockers.map((blocker) => ({ ...blocker })),
          lastCCriticVerdict: governance.lastCCriticVerdict,
          lastTsCriticSignal: governance.lastTsCriticSignal,
          lastPreStopGate: governance.lastPreStopGate
            ? { ...governance.lastPreStopGate, blockers: [...governance.lastPreStopGate.blockers] }
            : null,
          rebuttalMode: governance.rebuttalMode,
          visualTestLoopPending: governance.visualTestLoopPending,
          lastReadImageFile: governance.lastReadImageFile,
          blindOptimismFlag: governance.blindOptimismFlag,
          lastDispatchTarget: governance.lastDispatchTarget,
          userContinueDecision: governance.userContinueDecision,
          userComment: governance.userComment,
          userCheckedAt: governance.userCheckedAt,
          interactiveModeResolved: governance.interactiveModeResolved,
          interactiveModeGranularity: governance.interactiveModeGranularity,
          interactiveModeCustomTriggers: [...governance.interactiveModeCustomTriggers],
          interactiveModeConfirmedAt: governance.interactiveModeConfirmedAt,
          interactiveModeSource: governance.interactiveModeSource,
          languageResolved: governance.languageResolved,
          languageSource: governance.languageSource,
          pendingNextCall: governance.pendingNextCall,
          pendingNextCallReason: governance.pendingNextCallReason,
          pendingUnresolvedIssues: [...governance.pendingUnresolvedIssues],
          pendingNextCallIgnoredRounds: governance.pendingNextCallIgnoredRounds,
          lastInjectedNextCall: governance.lastInjectedNextCall,
        } : {}),
      }
      for (const blocker of state.governance.blockers) {
        const number = Number(/^BLK-(\d+)$/.exec(blocker.id)?.[1] ?? 0)
        if (Number.isInteger(number)) blockerCounter = Math.max(blockerCounter, number)
      }
    },
    currentSession(): string | null {
      return activeRuntimeSessionID
    },
    setSessionComplexityTier(tier: "LIGHT" | "MEDIUM" | "FULL"): void {
      const sessionID = activeRuntimeSessionID
      if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) return
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, { complexityTier: tier })
    },
    markPhase(phase: AionPhase, reason: string): void {
      const sessionID = activeRuntimeSessionID
      if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) return

      const current = sessionRuntimeState(runtimeState, sessionID)
      if (
        current?.lastPhase === phase &&
        current.phaseReason === reason &&
        !current.interrupted &&
        !current.resumeHint
      ) return

      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, {
        lastPhase: phase,
        phaseReason: reason,
        interrupted: false,
        resumeHint: null,
        complexityTier: state.governance.complexityTier,
      })
    },
    markInterrupted(reason: string, interrupt = true): void {
      const sessionID = activeRuntimeSessionID ?? state._lastSessionID
      if (
        !sessionID ||
        !runtimeState.preferences.preserveAcrossSessions
      ) return

      const phase = state.governance.phase
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, {
        lastPhase: phase,
        phaseReason: reason,
        interrupted: interrupt && phase !== "done",
        resumeHint: !interrupt || phase === "done"
          ? null
          : `Review .opencode/memory/todo-map.md and .opencode/memory/progress.md, then resume from ${phase}.`,
      })
    },
    clearResume(): void {
      const sessionID = activeRuntimeSessionID
      if (!sessionID) return
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, {
        interrupted: false,
        resumeHint: null,
      })
    },
    checkpoint(taskPatch?: Partial<TaskKeeperState>): void {
      checkpointRuntimeState(taskPatch)
    },
    reserveContinuation(sessionID: string, eventID?: string): void {
      runtimeState = updateSessionTaskState(ctx.directory, sessionID, {
        pendingContinuationEventID: eventID || null,
      })
    },
    recordContinuation(sessionID: string, eventID?: string): void {
      const persisted = readRuntimeState(ctx.directory)
      const continuationCount = sessionRuntimeState(persisted, sessionID)?.task.continuationCount ?? 0
      runtimeState = updateSessionTaskState(ctx.directory, sessionID, {
        continuationCount: continuationCount + 1,
        lastContinuationAt: nowIso(),
        lastContinuationEventID: eventID || null,
        pendingContinuationEventID: null,
      })
    },
    releaseContinuation(sessionID: string, eventID?: string): void {
      const persisted = readRuntimeState(ctx.directory)
      const pending = sessionRuntimeState(persisted, sessionID)?.task.pendingContinuationEventID ?? null
      if (pending && pending === (eventID || null)) {
        runtimeState = updateSessionTaskState(ctx.directory, sessionID, {
          pendingContinuationEventID: null,
        })
      }
    },
    taskState(): TaskKeeperState {
      const session = sessionRuntimeState(runtimeState, activeRuntimeSessionID)
      return session?.task ?? {
        objective: null,
        status: "idle",
        lastAuditAt: null,
        lastAudit: null,
        continuationCount: 0,
        lastContinuationAt: null,
        lastContinuationEventID: null,
        pendingContinuationEventID: null,
        goalCorrectionCount: 0,
        externalGoalStatus: "none",
      }
    },
    frontierState(): FrontierState {
      const session = sessionRuntimeState(runtimeState, activeRuntimeSessionID)
      return session?.frontier ?? defaultFrontierState()
    },
    activateFrontier(): FrontierState {
      const sessionID = activeRuntimeSessionID
      if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) {
        return runtimeControl.frontierState()
      }
      const next = activateFrontierState(runtimeControl.frontierState(), nowIso())
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, { frontier: next })
      return next
    },
    resetFrontier(): FrontierState {
      const sessionID = activeRuntimeSessionID
      if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) {
        return defaultFrontierState()
      }
      const next = resetFrontierState()
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, { frontier: next })
      return next
    },
    reportFrontier(report: FrontierReport): FrontierReportResult {
      const result = applyFrontierReport(runtimeControl.frontierState(), report, nowIso())
      if (result.accepted) {
        const sessionID = activeRuntimeSessionID
        if (sessionID && runtimeState.preferences.preserveAcrossSessions) {
          runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, { frontier: result.state })
        }
      }
      return result
    },
    advanceFrontier(threshold: number): FrontierState {
      const sessionID = activeRuntimeSessionID
      if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) {
        return runtimeControl.frontierState()
      }
      const next = advanceFrontierState(runtimeControl.frontierState(), threshold)
      runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, { frontier: next })
      return next
    },
    setExternalGoalStatus(status: TaskKeeperState["externalGoalStatus"]): void {
      checkpointRuntimeState({ externalGoalStatus: status })
    },
    resumeContext() {
      const session = sessionRuntimeState(runtimeState, activeRuntimeSessionID)
      return {
        lastPhase: session?.lastPhase ?? null,
        resumeHint: session?.resumeHint ?? null,
        interrupted: session?.interrupted ?? false,
      }
    },
    path(): string {
      return runtimeStatePath(ctx.directory)
    },
  }

  let activeRuntimeSessionID: string | null = runtimeState.activeSessionID
  let activeSessionActivated = false

  function checkpointRuntimeState(taskPatch?: Partial<TaskKeeperState>): void {
    const sessionID = activeRuntimeSessionID ?? state._lastSessionID
    if (!sessionID || !runtimeState.preferences.preserveAcrossSessions) return

    const previous = sessionRuntimeState(runtimeState, sessionID)?.task
    const previousGoalStatus = previous?.externalGoalStatus ?? "none"
    const nextGoalStatus = taskPatch?.externalGoalStatus ?? previousGoalStatus
    if (
      nextGoalStatus !== previousGoalStatus &&
      ["none", "active", "cancelled"].includes(nextGoalStatus)
    ) {
      runtimeControl.resetFrontier()
    }
    runtimeState = updateSessionRuntimeState(ctx.directory, sessionID, {
      lastPhase: state.governance.phase,
      phaseReason: state.governance.phaseReason,
      complexityTier: state.governance.complexityTier,
      rounds: {
        current: state.rounds.current,
        max: state.rounds.max,
      },
      governance: {
        stopSignal: state.governance.stopSignal,
        blockers: state.governance.blockers.map((blocker) => ({ ...blocker })),
        lastCCriticVerdict: state.governance.lastCCriticVerdict,
        lastTsCriticSignal: state.governance.lastTsCriticSignal,
        lastPreStopGate: state.governance.lastPreStopGate
          ? { ...state.governance.lastPreStopGate, blockers: [...state.governance.lastPreStopGate.blockers] }
          : null,
        rebuttalMode: state.governance.rebuttalMode,
        visualTestLoopPending: state.governance.visualTestLoopPending,
        lastReadImageFile: state.governance.lastReadImageFile,
        blindOptimismFlag: state.governance.blindOptimismFlag,
        lastDispatchTarget: state.governance.lastDispatchTarget,
        userContinueDecision: state.governance.userContinueDecision,
        userComment: state.governance.userComment,
        userCheckedAt: state.governance.userCheckedAt,
        interactiveModeResolved: state.governance.interactiveModeResolved,
        interactiveModeGranularity: state.governance.interactiveModeGranularity,
        interactiveModeCustomTriggers: [...state.governance.interactiveModeCustomTriggers],
        interactiveModeConfirmedAt: state.governance.interactiveModeConfirmedAt,
        interactiveModeSource: state.governance.interactiveModeSource,
        languageResolved: state.governance.languageResolved,
        languageSource: state.governance.languageSource,
        pendingNextCall: state.governance.pendingNextCall,
        pendingNextCallReason: state.governance.pendingNextCallReason,
        pendingUnresolvedIssues: [...state.governance.pendingUnresolvedIssues],
        pendingNextCallIgnoredRounds: state.governance.pendingNextCallIgnoredRounds,
        lastInjectedNextCall: state.governance.lastInjectedNextCall,
      },
      branches: [...state.branches.values()].map((branch) => ({ ...branch })),
      intent: state._lastIntent ?? "general",
      task: {
        objective: null,
        status: "idle",
        lastAuditAt: null,
        lastAudit: null,
        continuationCount: 0,
        lastContinuationAt: null,
        lastContinuationEventID: null,
        pendingContinuationEventID: null,
        goalCorrectionCount: 0,
        externalGoalStatus: "none",
        ...previous,
        ...taskPatch,
      },
      frontier: runtimeControl.frontierState(),
    })
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
      runtimeControl.markPhase(next, reason)
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
      runtimeControl.markPhase("init", "reset")
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
      runtimeControl.checkpoint()
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
      runtimeControl.checkpoint()
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
      runtimeControl.checkpoint()
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
      // Layer 1 — hard-coded rules (always on when the corresponding flag is true):
      //   - credentials / secret paths: .env, .pem, .key, /secrets/
      //   - AWS / private-key / password assignment in content
      //   - internal AION agent prompts (.opencode/agents/*.md) — anti-extraction
      //
      // Layer 2 — contract-driven gate (dataBoundaries from requirements-analyst):
      //   - forbiddenReads: list of glob patterns; if a path matches ANY, it is blocked.
      //   - allowedReads: when NON-EMPTY, the path MUST match at least one pattern,
      //     otherwise it is blocked (allowlist mode). When empty, all paths pass this
      //     layer (denylist-only mode).
      //
      // Note: project-root boundary is enforced by the hook (not here), and path
      // segments like /test/val/holdout/ are NOT a default block — the contract
      // is the source of truth.

      const normalized = filePath.toLowerCase()

      if (config.leakage.blockCredentials) {
        if (/\.env($|\.)/.test(normalized) || /\/secrets?\//.test(normalized) || /\.(pem|key)$/i.test(normalized)) {
          return { safe: false, reason: "credentials / secret path access is blocked" }
        }
        if (content) {
          if (/AKIA[0-9A-Z]{16}/.test(content)) return { safe: false, reason: "AWS key-like content" }
          if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content))
            return { safe: false, reason: "private key block in content" }
          if (/(password|api[_-]?key|token)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}/i.test(content)) {
            return { safe: false, reason: "credential assignment in content (password/api_key/token=...)" }
          }
        }
      }

      if (config.leakage.blockPromptsAccess) {
        if (/\.opencode\/agents\//.test(normalized) && /\.(md|markdown)$/i.test(normalized)) {
          return { safe: false, reason: "internal AION agent prompt read is blocked (anti-extraction)" }
        }
      }

      // Layer 2 — contract-driven data boundaries
      const boundaries = config.leakage.dataBoundaries
      if (boundaries) {
        // 2a. forbiddenReads (denylist): any match -> block
        for (const pattern of boundaries.forbiddenReads ?? []) {
          if (matchGlob(pattern, filePath)) {
            return { safe: false, reason: `data-boundary: forbiddenReads matched "${pattern}"` }
          }
        }
        // 2b. allowedReads (allowlist, opt-in): when set, anything not matching -> block
        const allowed = boundaries.allowedReads ?? []
        if (allowed.length > 0) {
          const ok = allowed.some((p) => matchGlob(p, filePath))
          if (!ok) {
            return {
              safe: false,
              reason: `data-boundary: allowedReads is non-empty and "${filePath}" matches none of [${allowed.join(", ")}]`,
            }
          }
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
    language: languageManager,
    complexity: complexityManager,
    runtimeControl,
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
