/**
 * Config loader.
 *
 * Reads `.opencode/aion.jsonc` (or `.aion.json`) from the workspace root,
 * strips JSONC comments, validates against the Zod schema, and returns the
 * typed config. On any error (file missing, invalid JSONC, schema mismatch)
 * it falls back to {@link DEFAULT_CONFIG} so the plugin always boots.
 *
 * `syncReadAionConfig` is the synchronous variant used by code paths that
 * cannot await (e.g. during module evaluation).
 */
import { existsSync, readFileSync } from "node:fs"
import { aionConfigSchema, type AionConfig } from "./types"
import { parseJsoncFile } from "../shared/jsonc"

export type LoadConfigArgs = {
  directory: string
  opencodeConfig?: unknown
}

const DEFAULT_CONFIG: AionConfig = {
  enabled: true,
  defaultAgent: "aion",
  governance: {
    enforceHierarchy: true,
    cCriticSupremacy: true,
  },
  leakage: {
    blockOnSuspicion: true,
    blockFutureInfo: true,
    blockHiddenSetAccess: true,
    blockPrivateData: true,
    blockCredentials: true,
    blockPromptsAccess: true,
    // memory/trace are now SHARED CACHE / SHARED EVENT BUS — all agents may access.
    blockMemoryAccess: false,
    // dataBoundaries is the contract-driven gate: requirements-analyst writes
    // forbiddenReads / allowedReads / labelColumns into the contract, and the
    // hook + aion_leakage_check tool enforce them. Empty by default = permissive.
    dataBoundaries: {
      allowedReads: [],
      forbiddenReads: [],
      internetAccess: true,
      runtimeHosts: [],
      labelColumns: [],
    },
  },
  autoContinue: {
    enabled: true,
    maxRounds: 30,
    delaySeconds: 2,
  },
  compaction: {
    autoRefreshAtKeyNodes: true,
    snapshotPath: ".opencode/memory/context-snapshot.md",
  },
  trace: {
    enabled: true,
    path: ".opencode/trace.md",
  },
  safety: {
    requirePrecheckForNewInput: true,
    requirePrecheckForHighRiskActions: true,
    requirePrecheckForKeyWrites: true,
  },
  personality: {
    enabled: true,
    entrance: true,
    transitions: true,
    heartbeats: true,
    completion: true,
    milestone: true,
    heartbeatMinMs: 60_000,
    heartbeatMaxMs: 180_000,
    maxHeartbeatsPerSession: 12,
  },
  interactiveMode: {
    enabled: false,
    granularity: "autonomous",
    customTriggers: [],
  },
  language: {
    mode: "en",
  },
  hfDatasets: {
    enabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    cacheDir: ".opencode/hf-cache",
    requestTimeoutMs: 15_000,
    maxRetries: 3,
    defaultLimit: 10,
  },
}

const CONFIG_CANDIDATES = [
  ".opencode/aion.jsonc",
  ".opencode/aion.json",
] as const

export async function loadAionConfig(
  directory: string,
  _opencodeConfig?: unknown,
): Promise<AionConfig> {
  let config: AionConfig = DEFAULT_CONFIG

  for (const rel of CONFIG_CANDIDATES) {
    const fullPath = `${directory}/${rel}`
    if (!existsSync(fullPath)) continue

    const parsed = parseJsoncFile<unknown>(fullPath)
    if (!parsed.ok) {
      console.warn(
        `[aion] Failed to parse ${fullPath}: ${parsed.error ?? "unknown"}; falling back to defaults`,
      )
      return DEFAULT_CONFIG
    }
    const validated = aionConfigSchema.safeParse(parsed.value)
    if (!validated.success) {
      console.warn(
        `[aion] Invalid config in ${fullPath}; using defaults. Errors: ${JSON.stringify(validated.error.format())}`,
      )
      return DEFAULT_CONFIG
    }
    config = validated.data
    break
  }

  return config
}

export function syncReadAionConfig(directory: string): AionConfig {
  for (const rel of CONFIG_CANDIDATES) {
    const fullPath = `${directory}/${rel}`
    if (!existsSync(fullPath)) continue
    try {
      const raw = readFileSync(fullPath, "utf-8")
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
        .replace(/,(\s*[}\]])/g, "$1")
      const value = JSON.parse(stripped)
      const validated = aionConfigSchema.safeParse(value)
      if (validated.success) return validated.data
    } catch {
      // fall through
    }
  }
  return DEFAULT_CONFIG
}
