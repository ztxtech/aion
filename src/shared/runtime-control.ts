import { randomUUID } from "node:crypto"
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export const EXECUTION_MODES = ["AUTO", "LIGHT", "MEDIUM", "FULL", "MAX"] as const

export type ExecutionMode = (typeof EXECUTION_MODES)[number]

export type RuntimePhase =
  | "init"
  | "gather"
  | "ts-pre-review"
  | "implement"
  | "ts-post-review"
  | "c-critic-final"
  | "loop-back"
  | "done"

export type RuntimePreferences = {
  tokenEconomy: "lean" | "balanced" | "high-evidence"
  preserveAcrossSessions: boolean
}

export type TaskKeeperStatus =
  | "idle"
  | "active"
  | "awaiting-review"
  | "completed"
  | "blocked"

export type TaskKeeperState = {
  objective: string | null
  status: TaskKeeperStatus
  lastAuditAt: string | null
  lastAudit: string | null
  continuationCount: number
  lastContinuationAt: string | null
  lastContinuationEventID: string | null
  pendingContinuationEventID: string | null
  goalCorrectionCount: number
  externalGoalStatus:
    | "none"
    | "active"
    | "paused"
    | "completed"
    | "unmet"
    | "cancelled"
    | "budgetLimited"
    | "usageLimited"
}

export type PersistedBlocker = {
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
  unblockCondition: string
  forbiddenAction: string
  raisedAt: string
}

export type PersistedGovernance = {
  stopSignal: "allow-stop" | "absolutely-cannot-stop-now" | "rebuttal-mode" | "rollback" | "unset"
  blockers: PersistedBlocker[]
  lastCCriticVerdict: "approve-stop" | "reject-stop" | "unset"
  lastTsCriticSignal: "allow-stop" | "absolutely-cannot-stop-now" | "rebuttal-mode" | "rollback" | "unset"
  lastPreStopGate: { allowStop: boolean; blockers: string[]; recordedAt: string } | null
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
  pendingNextCall: string | null
  pendingNextCallReason: string | null
  pendingUnresolvedIssues: string[]
  pendingNextCallIgnoredRounds: number
  lastInjectedNextCall: string | null
}

export type PersistedBranch = {
  branchId: string
  wave: number
  status: "alive" | "merged" | "dropped" | "leading"
  currentValue: number
  evidenceCount: number
  startedAt: string
}

export type SessionRuntimeState = {
  lastPhase: RuntimePhase | null
  phaseReason: string | null
  resumeHint: string | null
  interrupted: boolean
  complexityTier: "unset" | "LIGHT" | "MEDIUM" | "FULL"
  rounds: { current: number; max: number }
  governance: PersistedGovernance
  branches: PersistedBranch[]
  intent: string
  task: TaskKeeperState
  updatedAt: string | null
}

export type RuntimeState = {
  version: 2
  executionMode: ExecutionMode
  preferences: RuntimePreferences
  activeSessionID: string | null
  sessions: Record<string, SessionRuntimeState>
  updatedAt: string | null
}

export const RUNTIME_STATE_FILE = join(".opencode", "memory", "runtime-state.json")

const PHASES: readonly RuntimePhase[] = [
  "init",
  "gather",
  "ts-pre-review",
  "implement",
  "ts-post-review",
  "c-critic-final",
  "loop-back",
  "done",
]

const TOKEN_ECONOMIES: readonly RuntimePreferences["tokenEconomy"][] = [
  "lean",
  "balanced",
  "high-evidence",
]

const COMPLEXITY_TIERS: readonly SessionRuntimeState["complexityTier"][] = [
  "unset",
  "LIGHT",
  "MEDIUM",
  "FULL",
]

const TASK_STATUSES: readonly TaskKeeperStatus[] = [
  "idle",
  "active",
  "awaiting-review",
  "completed",
  "blocked",
]

const EXTERNAL_GOAL_STATUSES: readonly TaskKeeperState["externalGoalStatus"][] = [
  "none",
  "active",
  "paused",
  "completed",
  "unmet",
  "cancelled",
  "budgetLimited",
  "usageLimited",
]

const STOP_SIGNALS: readonly PersistedGovernance["stopSignal"][] = [
  "allow-stop",
  "absolutely-cannot-stop-now",
  "rebuttal-mode",
  "rollback",
  "unset",
]

const CRITIC_VERDICTS: readonly PersistedGovernance["lastCCriticVerdict"][] = [
  "approve-stop",
  "reject-stop",
  "unset",
]

const TS_CRITIC_SIGNALS: readonly PersistedGovernance["lastTsCriticSignal"][] = [
  "allow-stop",
  "absolutely-cannot-stop-now",
  "rebuttal-mode",
  "rollback",
  "unset",
]

const USER_DECISIONS: readonly PersistedGovernance["userContinueDecision"][] = ["continue", "stop", "unset"]
const INTERACTIVE_MODES: readonly PersistedGovernance["interactiveModeResolved"][] = ["unset", "interactive", "autonomous"]
const INTERACTIVE_GRANULARITIES: readonly PersistedGovernance["interactiveModeGranularity"][] = [
  "autonomous",
  "round-checkpoint",
  "always-interactive",
  "custom",
]
const MODE_SOURCES: readonly NonNullable<PersistedGovernance["interactiveModeSource"]>[] = [
  "session-start",
  "user-toggle",
  "config-default",
]
const LANGUAGE_MODES: readonly PersistedGovernance["languageResolved"][] = [
  "unset",
  "en",
  "zh-reason-en-deliver",
  "zh-deliver",
  "bilingual",
]
const BRANCH_STATUSES: readonly PersistedBranch["status"][] = ["alive", "merged", "dropped", "leading"]

const BLOCKER_SOURCES: readonly PersistedBlocker["source"][] = [
  "ts-critic",
  "c-critic",
  "main-agent",
  "information-collector",
  "requirements-analyst",
  "coder",
]

const MAX_SESSIONS = 32
const LOCK_TIMEOUT_MS = 2000
const STALE_LOCK_MS = 10_000
const runtimeStateCache = new Map<string, { fingerprint: string; state: RuntimeState }>()

const MODE_EFFECT: Record<ExecutionMode, string> = {
  AUTO: "Let the task classifier choose LIGHT, MEDIUM, or FULL.",
  LIGHT: "Lock LIGHT: main agent only and avoid subagent dispatch.",
  MEDIUM: "Lock MEDIUM: one focused worker and one review.",
  FULL: "Lock FULL: the complete serial pipeline and final cold review.",
  MAX: "Lock FULL edges and require evidence-backed steps before search or dispatch.",
}

export function runtimeStatePath(root: string): string {
  return join(root, RUNTIME_STATE_FILE)
}

export function defaultRuntimeState(): RuntimeState {
  return {
    version: 2,
    executionMode: "AUTO",
    preferences: {
      tokenEconomy: "balanced",
      preserveAcrossSessions: true,
    },
    activeSessionID: null,
    sessions: {},
    updatedAt: null,
  }
}

export function defaultSessionRuntimeState(): SessionRuntimeState {
  return {
    lastPhase: null,
    phaseReason: null,
    resumeHint: null,
    interrupted: false,
    complexityTier: "unset",
    rounds: { current: 0, max: 0 },
    governance: defaultPersistedGovernance(),
    branches: [],
    intent: "general",
    task: defaultTaskKeeperState(),
    updatedAt: null,
  }
}

export function defaultTaskKeeperState(): TaskKeeperState {
  return {
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
}

export function defaultPersistedGovernance(): PersistedGovernance {
  return {
    stopSignal: "unset",
    blockers: [],
    lastCCriticVerdict: "unset",
    lastTsCriticSignal: "unset",
    lastPreStopGate: null,
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
  }
}

export function parseExecutionMode(raw: unknown): ExecutionMode | null {
  if (typeof raw !== "string") return null
  const value = raw.trim().toUpperCase()
  return (EXECUTION_MODES as readonly string[]).includes(value)
    ? value as ExecutionMode
    : null
}

export function normalizeRuntimeState(raw: unknown): RuntimeState {
  const fallback = defaultRuntimeState()
  if (typeof raw !== "object" || raw === null) return fallback

  const source = raw as Partial<RuntimeState> & {
    lastPhase?: unknown
    phaseReason?: unknown
    resumeHint?: unknown
    interrupted?: unknown
  }
  const rawPreferences = (source.preferences ?? {}) as Partial<RuntimePreferences>
  const tokenEconomy = TOKEN_ECONOMIES.includes(rawPreferences.tokenEconomy as RuntimePreferences["tokenEconomy"])
    ? rawPreferences.tokenEconomy as RuntimePreferences["tokenEconomy"]
    : fallback.preferences.tokenEconomy

  const legacySession = normalizeSessionRuntimeState({
    lastPhase: source.lastPhase,
    phaseReason: source.phaseReason,
    resumeHint: source.resumeHint,
    interrupted: source.interrupted,
    updatedAt: source.updatedAt,
  })
  const sessions = Object.entries(source.sessions ?? {})
    .filter(([key, value]) => key.length > 0 && key.length <= 128 && typeof value === "object" && value !== null)
    .map(([key, value]) => [key, normalizeSessionRuntimeState(value)] as const)
  if (legacySession.lastPhase !== null && !sessions.some(([key]) => key === "__legacy__")) {
    sessions.push(["__legacy__", legacySession])
  }
  sessions.sort(([, left], [, right]) => Date.parse(right.updatedAt ?? "") - Date.parse(left.updatedAt ?? ""))

  return {
    version: 2,
    executionMode: parseExecutionMode(source.executionMode) ?? fallback.executionMode,
    preferences: {
      tokenEconomy,
      preserveAcrossSessions: rawPreferences.preserveAcrossSessions ?? fallback.preferences.preserveAcrossSessions,
    },
    activeSessionID: cleanID(source.activeSessionID),
    sessions: Object.fromEntries(sessions.slice(0, MAX_SESSIONS)),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  }
}

export function normalizeSessionRuntimeState(raw: unknown): SessionRuntimeState {
  const fallback = defaultSessionRuntimeState()
  if (typeof raw !== "object" || raw === null) return fallback

  const source = raw as Partial<SessionRuntimeState>
  const rounds = source.rounds ?? fallback.rounds
  const task = source.task ?? fallback.task
  return {
    lastPhase: PHASES.includes(source.lastPhase as RuntimePhase) ? source.lastPhase as RuntimePhase : null,
    phaseReason: cleanText(source.phaseReason),
    resumeHint: cleanText(source.resumeHint),
    interrupted: source.interrupted === true,
    complexityTier: COMPLEXITY_TIERS.includes(source.complexityTier as SessionRuntimeState["complexityTier"])
      ? source.complexityTier as SessionRuntimeState["complexityTier"]
      : fallback.complexityTier,
    rounds: {
      current: cleanNonNegativeInt(rounds.current),
      max: cleanNonNegativeInt(rounds.max),
    },
    governance: normalizePersistedGovernance(source.governance),
    branches: normalizeBranches(source.branches),
    intent: cleanText(source.intent, 100) ?? fallback.intent,
    task: {
      objective: cleanText(task.objective, 4000),
      status: TASK_STATUSES.includes(task.status) ? task.status : fallback.task.status,
      lastAuditAt: cleanText(task.lastAuditAt),
      lastAudit: cleanText(task.lastAudit, 2000),
      continuationCount: cleanNonNegativeInt(task.continuationCount),
      lastContinuationAt: cleanText(task.lastContinuationAt),
      lastContinuationEventID: cleanText(task.lastContinuationEventID, 200),
      pendingContinuationEventID: cleanText(task.pendingContinuationEventID, 200),
      goalCorrectionCount: cleanNonNegativeInt(task.goalCorrectionCount),
      externalGoalStatus: EXTERNAL_GOAL_STATUSES.includes(task.externalGoalStatus)
        ? task.externalGoalStatus
        : fallback.task.externalGoalStatus,
    },
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  }
}

export function readRuntimeState(root: string): RuntimeState {
  try {
    const path = runtimeStatePath(root)
    const fingerprint = fileFingerprint(path)
    const cached = runtimeStateCache.get(root)
    if (fingerprint && cached?.fingerprint === fingerprint) return cached.state

    const state = normalizeRuntimeState(JSON.parse(readFileSync(path, "utf8")))
    if (fingerprint) runtimeStateCache.set(root, { fingerprint, state })
    return state
  } catch {
    return defaultRuntimeState()
  }
}

export function updateRuntimeState(
  root: string,
  patch: Partial<Omit<RuntimeState, "version" | "updatedAt">>,
): RuntimeState {
  return mutateRuntimeState(root, (current) => ({
    executionMode: patch.executionMode ?? current.executionMode,
    preferences: {
      ...current.preferences,
      ...(patch.preferences ?? {}),
    },
    activeSessionID: patch.activeSessionID === undefined
      ? current.activeSessionID
      : patch.activeSessionID,
    sessions: patch.sessions ?? current.sessions,
  }))
}

export function sessionRuntimeState(
  state: RuntimeState,
  sessionID: string | null | undefined,
): SessionRuntimeState | null {
  const key = cleanID(sessionID)
  return key ? state.sessions[key] ?? null : null
}

export function updateSessionRuntimeState(
  root: string,
  sessionID: string,
  patch: Partial<Omit<SessionRuntimeState, "updatedAt">>,
): RuntimeState {
  const key = cleanID(sessionID)
  if (!key) throw new Error("AION runtime state requires a session ID")

  return mutateRuntimeState(root, (current) => {
    const session = normalizeSessionRuntimeState({
      ...defaultSessionRuntimeState(),
      ...current.sessions[key],
      ...patch,
      updatedAt: new Date().toISOString(),
    })

    return {
      activeSessionID: key,
      sessions: {
        ...current.sessions,
        [key]: session,
      },
    }
  })
}

export function updateSessionTaskState(
  root: string,
  sessionID: string,
  patch: Partial<TaskKeeperState>,
): RuntimeState {
  const key = cleanID(sessionID)
  if (!key) throw new Error("AION runtime state requires a session ID")

  return mutateRuntimeState(root, (current) => {
    const existing = current.sessions[key] ?? defaultSessionRuntimeState()
    const session: SessionRuntimeState = {
      ...existing,
      task: {
        ...defaultTaskKeeperState(),
        ...existing.task,
        ...patch,
      },
      updatedAt: new Date().toISOString(),
    }

    return {
      sessions: {
        ...current.sessions,
        [key]: session,
      },
    }
  })
}

export function setExecutionMode(root: string, mode: ExecutionMode): RuntimeState {
  return updateRuntimeState(root, {
    executionMode: mode,
  })
}

export function effectiveComplexityTier(
  mode: ExecutionMode,
  classifiedTier: "unset" | "LIGHT" | "MEDIUM" | "FULL",
): "unset" | "LIGHT" | "MEDIUM" | "FULL" {
  if (mode === "AUTO") return classifiedTier
  if (mode === "MAX") return "FULL"
  return mode
}

export function describeExecutionMode(mode: ExecutionMode): string {
  return MODE_EFFECT[mode]
}

export const MAX_EVIDENCE_PROMPT =
  "[AION MAX MODE]\n" +
  "Use FULL dispatch rules, but do not make routine assumptions before evidence.\n" +
  "Before implementation or external search, name the missing fact and the smallest artifact that can settle it.\n" +
  "Prefer one focused evidence pass over repeated broad searches; dispatch a collector only when the fact is material.\n" +
  "Record verified evidence in context-snapshot.md and keep each dispatch prompt anchored to it."

export function formatRuntimeStatus(state: RuntimeState, sessionID?: string | null): string {
  const session = sessionRuntimeState(state, sessionID)
  const phase = session?.lastPhase ?? "not started"
  const interrupted = session?.interrupted ? "yes" : "no"
  return [
    `Mode: ${state.executionMode} - ${describeExecutionMode(state.executionMode)}`,
    `Last phase: ${phase}`,
    `Interrupted: ${interrupted}`,
    session?.resumeHint ? `Resume: ${session.resumeHint}` : "Resume: no pending hint",
  ].join("\n")
}

function mutateRuntimeState(
  root: string,
  mutate: (current: RuntimeState) => Partial<Omit<RuntimeState, "version" | "updatedAt">>,
): RuntimeState {
  const target = runtimeStatePath(root)
  const lockPath = `${target}.lock`
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  mkdirSync(dirname(target), { recursive: true })
  const lockToken = acquireRuntimeLock(lockPath)

  try {
    const current = readRuntimeState(root)
    const next = normalizeRuntimeState({
      ...current,
      ...mutate(current),
      updatedAt: new Date().toISOString(),
    })
    writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    renameSync(temporary, target)
    cacheRuntimeState(root, next)
    return next
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {}
    throw error
  } finally {
    releaseRuntimeLock(lockPath, lockToken)
  }
}

function acquireRuntimeLock(lockPath: string): string {
  const deadline = Date.now() + LOCK_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockPath)
      const token = randomUUID()
      writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, token, at: Date.now() }), "utf8")
      return token
    } catch {
      try {
        const stats = statSync(lockPath)
        if (Date.now() - stats.mtimeMs > STALE_LOCK_MS) {
          rmSync(lockPath, { recursive: true, force: true })
        }
      } catch {}
    }
  }
  throw new Error(`Timed out waiting for AION runtime state lock: ${lockPath}`)
}

function releaseRuntimeLock(lockPath: string, token: string): void {
  try {
    const owner = JSON.parse(readFileSync(join(lockPath, "owner.json"), "utf8")) as { token?: string }
    if (owner.token === token) rmSync(lockPath, { recursive: true, force: true })
  } catch {}
}

function cleanID(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > 128 ? null : trimmed
}

function cacheRuntimeState(root: string, state: RuntimeState): void {
  const fingerprint = fileFingerprint(runtimeStatePath(root))
  if (fingerprint) runtimeStateCache.set(root, { fingerprint, state })
}

function fileFingerprint(path: string): string | null {
  try {
    const stats = statSync(path)
    return `${stats.ino}:${stats.size}:${stats.mtimeMs}`
  } catch {
    return null
  }
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength)
}

function cleanNonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0
}

function normalizeBlockers(value: unknown): PersistedBlocker[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): PersistedBlocker[] => {
    if (typeof item !== "object" || item === null) return []
    const source = item as Partial<PersistedBlocker>
    const id = cleanText(source.id, 64)
    const description = cleanText(source.description, 1000)
    if (!id || !description) return []
    return [{
      id,
      source: BLOCKER_SOURCES.includes(source.source as PersistedBlocker["source"])
        ? source.source as PersistedBlocker["source"]
        : "main-agent",
      description,
      evidence: cleanText(source.evidence, 2000) ?? "",
      unblockCondition: cleanText(source.unblockCondition, 2000) ?? "",
      forbiddenAction: cleanText(source.forbiddenAction, 2000) ?? "",
      raisedAt: cleanText(source.raisedAt) ?? nowIso(),
    }]
  }).slice(0, 100)
}

function normalizePersistedGovernance(raw: unknown): PersistedGovernance {
  const fallback = defaultPersistedGovernance()
  const source = typeof raw === "object" && raw !== null
    ? raw as Partial<PersistedGovernance>
    : {}
  const gate = source.lastPreStopGate
  return {
    stopSignal: STOP_SIGNALS.includes(source.stopSignal) ? source.stopSignal : fallback.stopSignal,
    blockers: normalizeBlockers(source.blockers),
    lastCCriticVerdict: CRITIC_VERDICTS.includes(source.lastCCriticVerdict)
      ? source.lastCCriticVerdict
      : fallback.lastCCriticVerdict,
    lastTsCriticSignal: TS_CRITIC_SIGNALS.includes(source.lastTsCriticSignal)
      ? source.lastTsCriticSignal
      : fallback.lastTsCriticSignal,
    lastPreStopGate: gate && typeof gate === "object"
      ? {
          allowStop: gate.allowStop === true,
          blockers: Array.isArray(gate.blockers)
            ? gate.blockers.filter((item): item is string => typeof item === "string").slice(0, 100)
            : [],
          recordedAt: typeof gate.recordedAt === "string" ? gate.recordedAt : nowIso(),
        }
      : null,
    rebuttalMode: source.rebuttalMode === true,
    visualTestLoopPending: source.visualTestLoopPending === true,
    lastReadImageFile: cleanText(source.lastReadImageFile, 1000),
    blindOptimismFlag: source.blindOptimismFlag === true,
    lastDispatchTarget: cleanText(source.lastDispatchTarget, 100),
    userContinueDecision: USER_DECISIONS.includes(source.userContinueDecision)
      ? source.userContinueDecision
      : fallback.userContinueDecision,
    userComment: cleanText(source.userComment, 2000),
    userCheckedAt: cleanText(source.userCheckedAt),
    interactiveModeResolved: INTERACTIVE_MODES.includes(source.interactiveModeResolved)
      ? source.interactiveModeResolved
      : fallback.interactiveModeResolved,
    interactiveModeGranularity: INTERACTIVE_GRANULARITIES.includes(source.interactiveModeGranularity)
      ? source.interactiveModeGranularity
      : fallback.interactiveModeGranularity,
    interactiveModeCustomTriggers: normalizeStringList(source.interactiveModeCustomTriggers, 50, 200),
    interactiveModeConfirmedAt: cleanText(source.interactiveModeConfirmedAt),
    interactiveModeSource: source.interactiveModeSource && MODE_SOURCES.includes(source.interactiveModeSource)
      ? source.interactiveModeSource
      : null,
    languageResolved: LANGUAGE_MODES.includes(source.languageResolved)
      ? source.languageResolved
      : fallback.languageResolved,
    languageSource: source.languageSource && MODE_SOURCES.includes(source.languageSource)
      ? source.languageSource
      : null,
    pendingNextCall: cleanText(source.pendingNextCall, 100),
    pendingNextCallReason: cleanText(source.pendingNextCallReason, 2000),
    pendingUnresolvedIssues: normalizeStringList(source.pendingUnresolvedIssues, 100, 2000),
    pendingNextCallIgnoredRounds: cleanNonNegativeInt(source.pendingNextCallIgnoredRounds),
    lastInjectedNextCall: cleanText(source.lastInjectedNextCall, 100),
  }
}

function normalizeBranches(value: unknown): PersistedBranch[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): PersistedBranch[] => {
    if (typeof item !== "object" || item === null) return []
    const source = item as Partial<PersistedBranch>
    const branchId = cleanText(source.branchId, 100)
    if (!branchId) return []
    return [{
      branchId,
      wave: cleanNonNegativeInt(source.wave),
      status: BRANCH_STATUSES.includes(source.status) ? source.status : "alive",
      currentValue: typeof source.currentValue === "number" && Number.isFinite(source.currentValue)
        ? source.currentValue
        : 0,
      evidenceCount: cleanNonNegativeInt(source.evidenceCount),
      startedAt: cleanText(source.startedAt) ?? nowIso(),
    }]
  }).slice(0, 100)
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean)
    .slice(0, maxItems)
}

function nowIso(): string {
  return new Date().toISOString()
}
