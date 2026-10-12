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

export type SessionRuntimeState = {
  lastPhase: RuntimePhase | null
  phaseReason: string | null
  resumeHint: string | null
  interrupted: boolean
  complexityTier: "unset" | "LIGHT" | "MEDIUM" | "FULL"
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

const MAX_SESSIONS = 32
const LOCK_TIMEOUT_MS = 2000
const STALE_LOCK_MS = 10_000

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
    updatedAt: null,
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
  return {
    lastPhase: PHASES.includes(source.lastPhase as RuntimePhase) ? source.lastPhase as RuntimePhase : null,
    phaseReason: cleanText(source.phaseReason),
    resumeHint: cleanText(source.resumeHint),
    interrupted: source.interrupted === true,
    complexityTier: COMPLEXITY_TIERS.includes(source.complexityTier as SessionRuntimeState["complexityTier"])
      ? source.complexityTier as SessionRuntimeState["complexityTier"]
      : fallback.complexityTier,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : null,
  }
}

export function readRuntimeState(root: string): RuntimeState {
  try {
    return normalizeRuntimeState(JSON.parse(readFileSync(runtimeStatePath(root), "utf8")))
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

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength)
}
