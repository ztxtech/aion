/**
 * Zod schema and inferred types for the entire AION configuration
 * (`.opencode/aion.jsonc`).
 *
 * Every field carries a `.default()` so a missing or partial config file
 * always yields a valid {@link AionConfig}. The schema is the single source
 * of truth — `load-config.ts` validates against it and falls back to
 * defaults on any parse / validation failure.
 */
import { z } from "zod"

export const AION_AGENT_NAMES = [
  "aion",
  "requirements-analyst",
  "information-collector",
  "coder",
  "ts-critic",
  "c-critic",
] as const

export type AionAgentName = (typeof AION_AGENT_NAMES)[number]

export const aionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  defaultAgent: z.string().default("aion"),
  governance: z.object({
    enforceHierarchy: z.boolean().default(true),
    cCriticSupremacy: z.boolean().default(true),
  }).default({ enforceHierarchy: true, cCriticSupremacy: true }),
  leakage: z.object({
    blockOnSuspicion: z.boolean().default(true),
    // blockFutureInfo + blockHiddenSetAccess + blockPrivateData are deprecated
    // since the v0.5.2 contract-driven rewrite. Hidden-set / private-data
    // access is now controlled by dataBoundaries.forbiddenReads (which the
    // requirements-analyst writes into the contract), not by path heuristics.
    // The flags are kept for backward compatibility (no-op) so existing user
    // aion.jsonc files keep loading. To re-enable, set the corresponding
    // dataBoundaries.forbiddenReads patterns in your aion.jsonc.
    blockFutureInfo: z.boolean().default(true),
    blockHiddenSetAccess: z.boolean().default(true),
    blockPrivateData: z.boolean().default(true),
    blockCredentials: z.boolean().default(true),
    blockPromptsAccess: z.boolean().default(true),
    // blockMemoryAccess: deprecated — .opencode/memory/* and .opencode/trace.md are
    // shared operational artifacts (SHARED CACHE / SHARED EVENT BUS). The default is
    // false (i.e. memory/trace are accessible to all agents). Setting this to true
    // is a no-op kept for config compatibility.
    blockMemoryAccess: z.boolean().default(false),
    // dataBoundaries: optional contract-driven leakage gate. When set, the hook
    // and the aion_leakage_check tool ALSO check the path against these patterns
    // (in addition to the hard-coded credentials/prompts rules). Each pattern is
    // a glob (e.g. "data/holdout/**", "competition/leaderboard*"). A path that
    // matches ANY forbiddenRead pattern returns safe: false with reason
    // "data-boundary: <pattern>". allowedReads is a denylist-style ALLOW list
    // (when set, anything NOT matching is blocked); left empty to allow by default.
    dataBoundaries: z.object({
      allowedReads: z.array(z.string()).default([]),
      forbiddenReads: z.array(z.string()).default([]),
      internetAccess: z.boolean().default(true),
      runtimeHosts: z.array(z.string()).default([]),
      labelColumns: z.array(z.string()).default([]),
      // Source describes how the contract was derived (e.g. "Kaggle Store Sales
      // public rules", "user-provided"). Stored for ts-critic / c-critic audit trail.
      source: z.string().optional(),
    }).default({
      allowedReads: [],
      forbiddenReads: [],
      internetAccess: true,
      runtimeHosts: [],
      labelColumns: [],
    }),
  }).default({
    blockOnSuspicion: true,
    blockFutureInfo: true,
    blockHiddenSetAccess: true,
    blockPrivateData: true,
    blockCredentials: true,
    blockPromptsAccess: true,
    blockMemoryAccess: false,
    dataBoundaries: {
      allowedReads: [],
      forbiddenReads: [],
      internetAccess: true,
      runtimeHosts: [],
      labelColumns: [],
    },
  }),
  autoContinue: z.object({
    enabled: z.boolean().default(true),
    maxRounds: z.number().int().min(0).default(30),
    delaySeconds: z.number().int().min(0).default(2),
  }).default({ enabled: true, maxRounds: 30, delaySeconds: 2 }),
  interactiveMode: z.object({
    enabled: z.boolean().default(false).describe("If true, after every c-critic verdict the user is asked whether to continue. If false, the loop runs autonomously."),
    granularity: z.enum(["autonomous", "round-checkpoint", "always-interactive", "custom"]).default("autonomous").describe(
      "autonomous = fully auto, no user prompts. " +
      "round-checkpoint = pause after c-critic verdicts. " +
      "always-interactive = pause at every major decision point (dispatch, critic verdict, plan switch, phase transition). " +
      "custom = user defines their own interaction triggers via the session-start question."
    ),
    customTriggers: z.array(z.string()).default([]).describe("When granularity=custom, list of trigger keywords the user defined (e.g. ['before-submit', 'after-experiment', 'critic-reject'])."),
  }).default({ enabled: false, granularity: "autonomous", customTriggers: [] }),
  language: z.object({
    mode: z.enum(["en", "zh-reason-en-deliver", "zh-deliver", "bilingual"]).default("en").describe(
      "en = English everywhere. " +
      "zh-reason-en-deliver = Chinese for interaction and reasoning, English for final code and delivery. " +
      "zh-deliver = Chinese delivery throughout. " +
      "bilingual = Chinese and English delivery (both produced)."
    ),
  }).default({ mode: "en" }),
  compaction: z.object({
    autoRefreshAtKeyNodes: z.boolean().default(true),
    snapshotPath: z.string().default(".opencode/memory/context-snapshot.md"),
  }).default({ autoRefreshAtKeyNodes: true, snapshotPath: ".opencode/memory/context-snapshot.md" }),
  trace: z.object({
    enabled: z.boolean().default(true),
    path: z.string().default(".opencode/trace.md"),
  }).default({ enabled: true, path: ".opencode/trace.md" }),
  safety: z.object({
    requirePrecheckForNewInput: z.boolean().default(true),
    requirePrecheckForHighRiskActions: z.boolean().default(true),
    requirePrecheckForKeyWrites: z.boolean().default(true),
  }).default({
    requirePrecheckForNewInput: true,
    requirePrecheckForHighRiskActions: true,
    requirePrecheckForKeyWrites: true,
  }),
  personality: z.object({
    enabled: z.boolean().default(true).describe("Master switch for I-AM-AION TUI toasts. Off = silent plugin."),
    entrance: z.boolean().default(true).describe("Fire a quip on each new session."),
    transitions: z.boolean().default(true).describe("Fire a quip on phase transitions (gather -> implement, etc)."),
    heartbeats: z.boolean().default(true).describe("Fire ambient pulse quips during long sessions."),
    completion: z.boolean().default(true).describe("Fire a blessing on loop completion."),
    milestone: z.boolean().default(true).describe("Fire on plan-size milestones."),
    heartbeatMinMs: z.number().int().min(0).default(60_000).describe("Minimum gap between heartbeats (ms)."),
    heartbeatMaxMs: z.number().int().min(0).default(180_000).describe("Maximum gap between heartbeats (ms); heartbeats are jittered within [min, max]."),
    maxHeartbeatsPerSession: z.number().int().min(0).default(12).describe("Cap on heartbeat toasts per session to avoid spam."),
  }).default({
    enabled: true,
    entrance: true,
    transitions: true,
    heartbeats: true,
    completion: true,
    milestone: true,
    heartbeatMinMs: 60_000,
    heartbeatMaxMs: 180_000,
    maxHeartbeatsPerSession: 12,
  }),
  hfDatasets: z.object({
    enabled: z.boolean().default(true).describe("Master switch for the aion_hf_* tool family. Off = hide all 4 tools."),
    cacheTtlMs: z.number().int().min(0).default(24 * 60 * 60 * 1000).describe("TTL for HF Hub API cache (.opencode/hf-cache/)."),
    cacheDir: z.string().default(".opencode/hf-cache").describe("Cache directory relative to workspace root."),
    requestTimeoutMs: z.number().int().min(1000).default(15_000).describe("Per-request timeout."),
    maxRetries: z.number().int().min(0).max(10).default(3).describe("Retries on 429/5xx."),
    defaultLimit: z.number().int().min(1).max(50).default(10).describe("Default `limit` for aion_hf_search."),
  }).default({
    enabled: true,
    cacheTtlMs: 24 * 60 * 60 * 1000,
    cacheDir: ".opencode/hf-cache",
    requestTimeoutMs: 15_000,
    maxRetries: 3,
    defaultLimit: 10,
  }),
})

export type AionConfig = z.infer<typeof aionConfigSchema>
export type AionPluginConfig = AionConfig
