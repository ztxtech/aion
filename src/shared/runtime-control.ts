import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
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

export type RuntimeState = {
  version: 1
  executionMode: ExecutionMode
  preferences: RuntimePreferences
  lastPhase: RuntimePhase | null
  phaseReason: string | null
  resumeHint: string | null
  interrupted: boolean
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
    version: 1,
    executionMode: "AUTO",
    preferences: {
      tokenEconomy: "balanced",
      preserveAcrossSessions: true,
    },
    lastPhase: null,
    phaseReason: null,
    resumeHint: null,
    interrupted: false,
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

  const source = raw as Partial<RuntimeState>
  const rawPreferences = (source.preferences ?? {}) as Partial<RuntimePreferences>
  const tokenEconomy = TOKEN_ECONOMIES.includes(rawPreferences.tokenEconomy as RuntimePreferences["tokenEconomy"])
    ? rawPreferences.tokenEconomy as RuntimePreferences["tokenEconomy"]
    : fallback.preferences.tokenEconomy

  return {
    ...fallback,
    ...source,
    version: 1,
    executionMode: parseExecutionMode(source.executionMode) ?? fallback.executionMode,
    preferences: {
      tokenEconomy,
      preserveAcrossSessions: rawPreferences.preserveAcrossSessions ?? fallback.preferences.preserveAcrossSessions,
    },
    lastPhase: PHASES.includes(source.lastPhase as RuntimePhase) ? source.lastPhase as RuntimePhase : null,
    phaseReason: cleanText(source.phaseReason),
    resumeHint: cleanText(source.resumeHint),
    interrupted: source.interrupted === true,
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
  const current = readRuntimeState(root)
  const next = normalizeRuntimeState({
    ...current,
    ...patch,
    preferences: {
      ...current.preferences,
      ...(patch.preferences ?? {}),
    },
    updatedAt: new Date().toISOString(),
  })

  const target = runtimeStatePath(root)
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8")
  try {
    renameSync(temporary, target)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {}
    throw error
  }
  return next
}

export function setExecutionMode(root: string, mode: ExecutionMode): RuntimeState {
  const current = readRuntimeState(root)
  return updateRuntimeState(root, {
    executionMode: mode,
    interrupted: false,
    resumeHint: mode === "AUTO" ? null : current.resumeHint,
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

export function formatRuntimeStatus(state: RuntimeState): string {
  const phase = state.lastPhase ?? "not started"
  const interrupted = state.interrupted ? "yes" : "no"
  return [
    `Mode: ${state.executionMode} - ${describeExecutionMode(state.executionMode)}`,
    `Last phase: ${phase}`,
    `Interrupted: ${interrupted}`,
    state.resumeHint ? `Resume: ${state.resumeHint}` : "Resume: no pending hint",
  ].join("\n")
}

function cleanText(value: unknown, maxLength = 500): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength)
}
