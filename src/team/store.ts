/**
 * TeamStore — JSON-file persistence for team specs and runtime state.
 *
 * Each team is persisted as a JSON spec file under `.aion/teams/` and a
 * runtime state file under `.aion/runtime/`. Handles lead derivation (the
 * first eligible member becomes lead), member→runtime conversion, and a
 * `.highwatermark` file used to track the last-read message per member.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import type { AionAgentName } from "../config/types"

export type TeamMemberSpec = {
  name: string
  kind: "subagent_type"
  subagentType: AionAgentName
  prompt?: string
  worktreePath?: string
  isLead?: boolean
  category?: never
}

export type TeamCategorySpec = {
  name: string
  kind: "category"
  category: "deep" | "quick"
  prompt: string
  isLead?: boolean
  worktreePath?: string
  subagentType?: never
}

export type TeamMemberEntry = TeamMemberSpec | TeamCategorySpec

export type TeamLead = { kind: "subagent_type"; subagentType: AionAgentName }

export type TeamSpec = {
  name: string
  description?: string
  version?: number
  createdAt?: string
  leadAgentId?: string
  lead?: TeamLead
  members: TeamMemberEntry[]
}

export type MemberRuntimeStatus = "starting" | "active" | "shutdown_requested" | "shutting_down" | "shut_down" | "errored"

export type TeamRuntimeMember = {
  name: string
  kind: "subagent_type" | "category"
  subagentType: AionAgentName
  category?: "deep" | "quick"
  prompt?: string
  worktreePath?: string
  isLead: boolean
  status: MemberRuntimeStatus
  sessionId?: string
  startedAt: string
  lastSeen: string
  messageCount: number
  turnCount: number
  unreadBytes: number
}

export type TeamRuntimeState = {
  teamRunId: string
  teamName: string
  createdAt: string
  updatedAt: string
  createdBy: string
  maxParallelMembers: number
  maxMembers: number
  maxMessagesPerRun: number
  maxWallClockMinutes: number
  maxMemberTurns: number
  messagePayloadMaxBytes: number
  recipientUnreadMaxBytes: number
  members: TeamRuntimeMember[]
  activeCount: number
  pendingShutdown: { requestedBy: string; requestedAt: string; member: string }[]
  messageCount: number
}

export class TeamStore {
  constructor(private readonly baseDir: string) {}

  private teamsDir(): string {
    return join(this.baseDir, "teams")
  }

  private teamSpecPath(name: string): string {
    return join(this.teamsDir(), name, "config.json")
  }

  private runtimeDir(): string {
    return join(this.baseDir, "runtime")
  }

  private runtimePath(teamRunId: string): string {
    return join(this.runtimeDir(), teamRunId, "state.json")
  }

  private highWatermarkPath(): string {
    return join(this.baseDir, ".highwatermark")
  }

  async ensureBase(): Promise<void> {
    await mkdir(this.teamsDir(), { recursive: true })
    await mkdir(this.runtimeDir(), { recursive: true })
  }

  async saveSpec(spec: TeamSpec): Promise<void> {
    const dir = join(this.teamsDir(), spec.name)
    await mkdir(dir, { recursive: true })
    const final: TeamSpec = {
      ...spec,
      version: spec.version ?? 1,
      createdAt: spec.createdAt ?? new Date().toISOString(),
    }
    const lead = final.lead ?? this.deriveLead(final)
    final.lead = lead
    final.leadAgentId = this.findLeadMember(final)?.name
    await writeFile(this.teamSpecPath(spec.name), JSON.stringify(final, null, 2), "utf-8")
  }

  async loadSpec(name: string): Promise<TeamSpec | null> {
    const p = this.teamSpecPath(name)
    if (!existsSync(p)) return null
    const raw = await readFile(p, "utf-8")
    return JSON.parse(raw) as TeamSpec
  }

  async listSpecs(): Promise<string[]> {
    const dir = this.teamsDir()
    if (!existsSync(dir)) return []
    const entries = await readdir(dir)
    return entries.filter((e) => existsSync(join(dir, e, "config.json")))
  }

  async listActiveRuns(): Promise<string[]> {
    const dir = this.runtimeDir()
    if (!existsSync(dir)) return []
    const entries = await readdir(dir)
    return entries
  }

  async createRuntime(args: {
    spec: TeamSpec
    createdBy: string
    maxParallelMembers: number
    maxMembers: number
    maxMessagesPerRun: number
    maxWallClockMinutes: number
    maxMemberTurns: number
    messagePayloadMaxBytes: number
    recipientUnreadMaxBytes: number
  }): Promise<TeamRuntimeState> {
    if (args.spec.members.length > args.maxMembers) {
      throw new Error(
        `Team ${args.spec.name} declares ${args.spec.members.length} members, exceeds max_members=${args.maxMembers}`,
      )
    }
    const teamRunId = `${args.spec.name}-${randomUUID().slice(0, 8)}`
    const now = new Date().toISOString()
    const state: TeamRuntimeState = {
      teamRunId,
      teamName: args.spec.name,
      createdAt: now,
      updatedAt: now,
      createdBy: args.createdBy,
      maxParallelMembers: args.maxParallelMembers,
      maxMembers: args.maxMembers,
      maxMessagesPerRun: args.maxMessagesPerRun,
      maxWallClockMinutes: args.maxWallClockMinutes,
      maxMemberTurns: args.maxMemberTurns,
      messagePayloadMaxBytes: args.messagePayloadMaxBytes,
      recipientUnreadMaxBytes: args.recipientUnreadMaxBytes,
      members: args.spec.members.map((m) => this.toRuntimeMember(m, now)),
      activeCount: 0,
      pendingShutdown: [],
      messageCount: 0,
    }
    await mkdir(join(this.runtimeDir(), teamRunId), { recursive: true })
    await writeFile(this.runtimePath(teamRunId), JSON.stringify(state, null, 2), "utf-8")
    await writeFile(this.highWatermarkPath(), teamRunId, "utf-8")
    return state
  }

  async loadRuntime(teamRunId: string): Promise<TeamRuntimeState | null> {
    const p = this.runtimePath(teamRunId)
    if (!existsSync(p)) return null
    const raw = await readFile(p, "utf-8")
    return JSON.parse(raw) as TeamRuntimeState
  }

  async saveRuntime(state: TeamRuntimeState): Promise<void> {
    state.updatedAt = new Date().toISOString()
    await writeFile(this.runtimePath(state.teamRunId), JSON.stringify(state, null, 2), "utf-8")
  }

  async deleteRuntime(teamRunId: string): Promise<boolean> {
    const dir = join(this.runtimeDir(), teamRunId)
    if (!existsSync(dir)) return false
    await rm(dir, { recursive: true, force: true })
    return true
  }

  async touchMember(teamRunId: string, member: string): Promise<void> {
    const state = await this.loadRuntime(teamRunId)
    if (!state) return
    const m = state.members.find((x) => x.name === member)
    if (!m) return
    m.lastSeen = new Date().toISOString()
    await this.saveRuntime(state)
  }

  private toRuntimeMember(m: TeamMemberEntry, now: string): TeamRuntimeMember {
    const base: TeamRuntimeMember = {
      name: m.name,
      kind: m.kind,
      subagentType: m.subagentType ?? "aion",
      category: m.kind === "category" ? m.category : undefined,
      prompt: m.prompt,
      worktreePath: m.worktreePath,
      isLead: m.isLead ?? false,
      status: "starting",
      startedAt: now,
      lastSeen: now,
      messageCount: 0,
      turnCount: 0,
      unreadBytes: 0,
    }
    return base
  }

  private deriveLead(spec: TeamSpec): TeamLead {
    const explicit = spec.members.find((m) => m.isLead)
    if (explicit && explicit.kind === "subagent_type") {
      return { kind: "subagent_type", subagentType: explicit.subagentType }
    }
    if (spec.members.length === 1) {
      const only = spec.members[0]
      if (only.kind === "subagent_type") {
        return { kind: "subagent_type", subagentType: only.subagentType }
      }
    }
    return { kind: "subagent_type", subagentType: "aion" }
  }

  private findLeadMember(spec: TeamSpec): TeamMemberEntry | undefined {
    return spec.members.find((m) => m.isLead)
  }
}
