/**
 * Zod schema and inferred types for the entire AION configuration
 * (`.opencode/aion.jsonc`).
 *
 * Every field carries a `.default()` so a missing or partial config file
 * always yields a valid {@link AionConfig}. The schema is the single source
 * of truth — `load-config.ts` validates against it and falls back to
 * defaults on any parse / validation failure.
 *
 * Also exports the team-mode membership sets:
 *   - {@link AION_TEAM_ELIGIBLE_AGENTS} — agents allowed to be team members
 *   - {@link AION_TEAM_HARD_REJECT}     — critics that may never be members
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

export const teamModeConfigSchema = z.object({
  enabled: z.boolean().default(true),
  tmuxVisualization: z.boolean().default(true),
  maxParallelMembers: z.number().int().min(1).max(8).default(6),
  maxMembers: z.number().int().min(1).max(8).default(8),
  maxMessagesPerRun: z.number().int().min(1).default(20000),
  maxWallClockMinutes: z.number().int().min(1).default(240),
  maxMemberTurns: z.number().int().min(1).default(800),
  baseDir: z.string().optional(),
  messagePayloadMaxBytes: z.number().int().min(1024).default(65536),
  recipientUnreadMaxBytes: z.number().int().min(1024).default(524288),
  mailboxPollIntervalMs: z.number().int().min(500).default(2000),
})

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
  }).default({
    blockOnSuspicion: true,
    blockFutureInfo: true,
    blockHiddenSetAccess: true,
    blockPrivateData: true,
    blockCredentials: true,
    blockPromptsAccess: true,
    blockMemoryAccess: false,
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
      "round-checkpoint = pause after each c-critic verdict to ask continue/stop. " +
      "always-interactive = pause at every major decision point (dispatch, critic verdict, plan switch, phase transition). " +
      "custom = user defines their own interaction triggers via the session-start question."
    ),
    customTriggers: z.array(z.string()).default([]).describe("When granularity=custom, list of trigger keywords the user defined (e.g. ['before-submit', 'after-experiment', 'critic-reject'])."),
  }).default({ enabled: false, granularity: "autonomous", customTriggers: [] }),
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
  teamMode: teamModeConfigSchema.default({
    enabled: true,
    tmuxVisualization: true,
    maxParallelMembers: 6,
    maxMembers: 8,
    maxMessagesPerRun: 20000,
    maxWallClockMinutes: 240,
    maxMemberTurns: 800,
    messagePayloadMaxBytes: 65536,
    recipientUnreadMaxBytes: 524288,
    mailboxPollIntervalMs: 2000,
  }),
})

export type TeamModeConfig = z.infer<typeof teamModeConfigSchema>
export type AionConfig = z.infer<typeof aionConfigSchema>
export type AionPluginConfig = AionConfig

export const AION_TEAM_ELIGIBLE_AGENTS = new Set<AionAgentName>([
  "aion",
  "requirements-analyst",
  "coder",
])

export const AION_TEAM_HARD_REJECT = new Set<AionAgentName>([
  "ts-critic",
  "c-critic",
])
