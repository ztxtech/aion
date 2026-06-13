import { join } from "node:path"
import { existsSync, mkdirSync } from "node:fs"
import { TeamStore, type TeamRuntimeState, type TeamSpec } from "./store"
import { MailboxStore, type MailboxMessage } from "./mailbox"
import { TaskStore, type TeamTask, type TeamTaskStatus } from "./tasks"
import { AION_TEAM_ELIGIBLE_AGENTS, AION_TEAM_HARD_REJECT, type AionAgentName } from "../config/types"
import type { TeamModeConfig } from "../config/types"

export type TeamSendResult = {
  message: MailboxMessage
  deliveredTo: string[]
  broadcast: boolean
}

export type TeamShutdownRequest = {
  requestedBy: string
  requestedAt: string
  member: string
}

export class TeamCoordinator {
  private readonly teamStore: TeamStore
  private readonly mailbox: MailboxStore
  private readonly tasks: TaskStore

  constructor(private readonly baseDir: string, private readonly mode: TeamModeConfig) {
    mkdirSync(baseDir, { recursive: true })
    this.teamStore = new TeamStore(baseDir)
    this.mailbox = new MailboxStore(baseDir)
    this.tasks = new TaskStore(baseDir)
  }

  private checkWallClock(state: TeamRuntimeState): void {
    if (state.maxWallClockMinutes <= 0) return
    const elapsed = (Date.now() - new Date(state.createdAt).getTime()) / 60000
    if (elapsed > state.maxWallClockMinutes) {
      throw new Error(
        `team ${state.teamRunId} exceeded max_wall_clock_minutes=${state.maxWallClockMinutes} (elapsed ${elapsed.toFixed(1)} min)`,
      )
    }
  }

  async init(): Promise<void> {
    await this.teamStore.ensureBase()
  }

  validateSpec(spec: TeamSpec): { ok: true } | { ok: false; error: string } {
    for (const m of spec.members) {
      if (m.kind === "subagent_type") {
        if (AION_TEAM_HARD_REJECT.has(m.subagentType as AionAgentName)) {
          return {
            ok: false,
            error: `member ${m.name} uses hard-reject agent ${m.subagentType}; cannot write mailbox state. Use delegate-task instead.`,
          }
        }
        if (!AION_TEAM_ELIGIBLE_AGENTS.has(m.subagentType as AionAgentName)) {
          return {
            ok: false,
            error: `member ${m.name} uses ineligible agent ${m.subagentType}`,
          }
        }
      }
      if (m.kind === "category" && !m.prompt?.trim()) {
        return {
          ok: false,
          error: `category member ${m.name} requires non-empty prompt`,
        }
      }
    }
    if (spec.members.length > this.mode.maxMembers) {
      return {
        ok: false,
        error: `team declares ${spec.members.length} members, exceeds max_members=${this.mode.maxMembers}`,
      }
    }
    return { ok: true }
  }

  async createTeam(args: {
    spec: TeamSpec
    createdBy: string
  }): Promise<{ state: TeamRuntimeState; spec: TeamSpec }> {
    const check = this.validateSpec(args.spec)
    if (!check.ok) throw new Error(check.error)
    await this.teamStore.saveSpec(args.spec)
    const saved = (await this.teamStore.loadSpec(args.spec.name))!
    const state = await this.teamStore.createRuntime({
      spec: saved,
      createdBy: args.createdBy,
      maxParallelMembers: this.mode.maxParallelMembers,
      maxMembers: this.mode.maxMembers,
      maxMessagesPerRun: this.mode.maxMessagesPerRun,
      maxWallClockMinutes: this.mode.maxWallClockMinutes,
      maxMemberTurns: this.mode.maxMemberTurns,
      messagePayloadMaxBytes: this.mode.messagePayloadMaxBytes,
      recipientUnreadMaxBytes: this.mode.recipientUnreadMaxBytes,
    })
    await this.mailbox.ensureLayout(
      state.teamRunId,
      state.members.map((m) => m.name),
    )
    return { state, spec: saved }
  }

  async listTeams(): Promise<{ declared: string[]; active: { teamRunId: string; teamName: string; createdAt: string; activeCount: number; memberCount: number }[] }> {
    const declared = await this.teamStore.listSpecs()
    const activeRuns = await this.teamStore.listActiveRuns()
    const active: { teamRunId: string; teamName: string; createdAt: string; activeCount: number; memberCount: number }[] = []
    for (const runId of activeRuns) {
      const state = await this.teamStore.loadRuntime(runId)
      if (!state) continue
      active.push({
        teamRunId: state.teamRunId,
        teamName: state.teamName,
        createdAt: state.createdAt,
        activeCount: state.activeCount,
        memberCount: state.members.length,
      })
    }
    return { declared, active }
  }

  async getStatus(teamRunId: string): Promise<TeamRuntimeState | null> {
    return this.teamStore.loadRuntime(teamRunId)
  }

  async deleteTeam(teamRunId: string): Promise<{ ok: boolean; reason?: string }> {
    const state = await this.teamStore.loadRuntime(teamRunId)
    if (!state) return { ok: false, reason: "no such teamRunId" }
    const activeMembers = state.members.filter(
      (m) => m.status === "active" || m.status === "starting",
    )
    if (activeMembers.length > 0) {
      return {
        ok: false,
        reason: `cannot delete: ${activeMembers.length} active members. Shutdown first.`,
      }
    }
    await this.teamStore.deleteRuntime(teamRunId)
    return { ok: true }
  }

  async sendMessage(args: {
    teamRunId: string
    from: string
    to: string | "broadcast"
    subject: string
    body: string
    kind?: MailboxMessage["kind"]
    meta?: Record<string, unknown>
  }): Promise<TeamSendResult> {
    const state = await this.teamStore.loadRuntime(args.teamRunId)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    this.checkWallClock(state)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    if (state.messageCount >= state.maxMessagesPerRun) {
      throw new Error(`message cap reached: ${state.maxMessagesPerRun}`)
    }
    if (Buffer.byteLength(args.body, "utf-8") > state.messagePayloadMaxBytes) {
      throw new Error(
        `payload ${Buffer.byteLength(args.body, "utf-8")} bytes exceeds ${state.messagePayloadMaxBytes}`,
      )
    }
    if (args.to !== "broadcast") {
      const target = state.members.find((m) => m.name === args.to)
      if (!target) throw new Error(`unknown recipient ${args.to}`)
      const unreadBytes = await this.mailbox.unreadBytes(args.teamRunId, args.to)
      if (unreadBytes + Buffer.byteLength(args.body, "utf-8") > state.recipientUnreadMaxBytes) {
        throw new Error(
          `recipient ${args.to} unread budget would exceed ${state.recipientUnreadMaxBytes}`,
        )
      }
    } else if (args.from !== this.findLeadName(state)) {
      throw new Error("only lead may broadcast")
    }

    const msg = await this.mailbox.send({
      teamRunId: args.teamRunId,
      from: args.from,
      to: args.to,
      subject: args.subject,
      body: args.body,
      kind: args.kind ?? "info",
      meta: args.meta,
    })

    state.messageCount++
    if (args.to === "broadcast") {
      for (const m of state.members) {
        if (m.name !== args.from) m.messageCount++
        m.unreadBytes = await this.mailbox.unreadBytes(args.teamRunId, m.name)
      }
    } else {
      const recipient = state.members.find((m) => m.name === args.to)
      if (recipient) {
        recipient.messageCount++
        recipient.unreadBytes = await this.mailbox.unreadBytes(args.teamRunId, args.to)
      }
    }
    await this.teamStore.saveRuntime(state)

    return {
      message: msg,
      deliveredTo: args.to === "broadcast" ? state.members.map((m) => m.name) : [args.to],
      broadcast: args.to === "broadcast",
    }
  }

  async pollInbox(args: {
    teamRunId: string
    member: string
  }): Promise<MailboxMessage[]> {
    await this.mailbox.reclaimStale(args.teamRunId, args.member)
    return this.mailbox.listUnread(args.teamRunId, args.member)
  }

  async acknowledgeMessage(args: {
    teamRunId: string
    member: string
    messageId: string
  }): Promise<void> {
    const reserved = await this.mailbox.reserve(args.teamRunId, args.member, args.messageId)
    if (!reserved) {
      await this.mailbox.markRead(args.teamRunId, args.member, args.messageId)
      return
    }
    await this.mailbox.commit(args.teamRunId, args.member, args.messageId)
  }

  async requestShutdown(args: {
    teamRunId: string
    from: string
    member: string
  }): Promise<TeamRuntimeState> {
    const state = await this.teamStore.loadRuntime(args.teamRunId)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    this.checkWallClock(state)
    if (!state.members.find((m) => m.name === args.from)?.isLead) {
      throw new Error("only lead may request shutdown")
    }
    if (!state.members.find((m) => m.name === args.member)) {
      throw new Error(`unknown member ${args.member}`)
    }
    if (state.pendingShutdown.find((p) => p.member === args.member)) {
      return state
    }
    state.pendingShutdown.push({
      requestedBy: args.from,
      requestedAt: new Date().toISOString(),
      member: args.member,
    })
    const target = state.members.find((m) => m.name === args.member)
    if (target) target.status = "shutdown_requested"
    await this.teamStore.saveRuntime(state)
    return state
  }

  async approveShutdown(args: {
    teamRunId: string
    from: string
    member: string
  }): Promise<TeamRuntimeState> {
    const state = await this.teamStore.loadRuntime(args.teamRunId)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    const target = state.members.find((m) => m.name === args.member)
    if (!target) throw new Error(`unknown member ${args.member}`)
    target.status = "shut_down"
    state.pendingShutdown = state.pendingShutdown.filter((p) => p.member !== args.member)
    state.activeCount = state.members.filter((m) => m.status === "active").length
    await this.teamStore.saveRuntime(state)
    return state
  }

  async rejectShutdown(args: {
    teamRunId: string
    from: string
    member: string
    reason?: string
  }): Promise<TeamRuntimeState> {
    const state = await this.teamStore.loadRuntime(args.teamRunId)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    const target = state.members.find((m) => m.name === args.member)
    if (!target) throw new Error(`unknown member ${args.member}`)
    if (target.status === "shutdown_requested") target.status = "active"
    state.pendingShutdown = state.pendingShutdown.filter((p) => p.member !== args.member)
    if (args.reason) {
      await this.mailbox.send({
        teamRunId: args.teamRunId,
        from: args.from,
        to: this.findLeadName(state),
        subject: `shutdown rejected for ${args.member}`,
        body: args.reason,
        kind: "shutdown-nack",
      })
    }
    await this.teamStore.saveRuntime(state)
    return state
  }

  async createTask(args: {
    teamRunId: string
    from: string
    title: string
    description: string
    priority?: number
    dependencies?: string[]
  }): Promise<TeamTask> {
    const state = await this.teamStore.loadRuntime(args.teamRunId)
    if (!state) throw new Error(`no such teamRunId ${args.teamRunId}`)
    this.checkWallClock(state)
    return this.tasks.create({
      teamRunId: args.teamRunId,
      title: args.title,
      description: args.description,
      createdBy: args.from,
      priority: args.priority,
      dependencies: args.dependencies,
    })
  }

  async listTasks(teamRunId: string): Promise<TeamTask[]> {
    return this.tasks.list(teamRunId)
  }

  async getTask(teamRunId: string, id: string): Promise<TeamTask | null> {
    return this.tasks.get(teamRunId, id)
  }

  async updateTask(
    teamRunId: string,
    id: string,
    patch: { status?: TeamTaskStatus; owner?: string; blockedReason?: string; resultSummary?: string },
  ): Promise<TeamTask | null> {
    return this.tasks.update(teamRunId, id, patch)
  }

  async setMemberStatus(
    teamRunId: string,
    member: string,
    status: TeamRuntimeState["members"][number]["status"],
  ): Promise<void> {
    const state = await this.teamStore.loadRuntime(teamRunId)
    if (!state) return
    this.checkWallClock(state)
    const m = state.members.find((x) => x.name === member)
    if (!m) return
    if (status === "active" && m.status !== "active") {
      const currentActive = state.members.filter((x) => x.status === "active").length
      if (currentActive >= state.maxParallelMembers) {
        throw new Error(
          `cannot activate ${member}: ${currentActive} active members already at max_parallel_members=${state.maxParallelMembers}`,
        )
      }
    }
    m.status = status
    m.lastSeen = new Date().toISOString()
    state.activeCount = state.members.filter((x) => x.status === "active").length
    await this.teamStore.saveRuntime(state)
  }

  async incrementMemberTurn(teamRunId: string, member: string): Promise<number> {
    const state = await this.teamStore.loadRuntime(teamRunId)
    if (!state) return 0
    const m = state.members.find((x) => x.name === member)
    if (!m) return 0
    m.turnCount++
    m.lastSeen = new Date().toISOString()
    if (m.turnCount > state.maxMemberTurns) {
      throw new Error(`member ${member} exceeded max_member_turns=${state.maxMemberTurns}`)
    }
    await this.teamStore.saveRuntime(state)
    return m.turnCount
  }

  private findLeadName(state: TeamRuntimeState): string {
    return state.members.find((m) => m.isLead)?.name ?? state.members[0]?.name ?? ""
  }
}

export function resolveTeamBaseDir(directory: string, override?: string): string {
  if (override && override.trim().length > 0) return override
  return join(directory, ".aion")
}
