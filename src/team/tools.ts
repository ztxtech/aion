import { tool } from "@opencode-ai/plugin"
import { join } from "node:path"
import { TeamCoordinator, resolveTeamBaseDir } from "./coordinator"
import type { TeamSpec, TeamMemberEntry } from "./store"
import type { TeamModeConfig } from "../config/types"
import { layoutForMembers, generateTmuxScript, isTmuxAvailable, createTmuxSession } from "./tmux"

const z = tool.schema

const memberSchema = z.union([
  z.object({
    name: z.string().describe("Stable member id (e.g. 'scout-1')"),
    kind: z.literal("subagent_type"),
    subagent_type: z.enum(["aion", "requirements-analyst", "coder"]).describe("Eligible AION subagent type"),
    prompt: z.string().optional(),
    worktreePath: z.string().optional(),
    isLead: z.boolean().optional(),
  }),
  z.object({
    name: z.string().describe("Stable member id (e.g. 'scout-1')"),
    kind: z.literal("category"),
    category: z.enum(["deep", "quick"]),
    prompt: z.string().min(1).describe("Required for category members"),
    worktreePath: z.string().optional(),
    isLead: z.boolean().optional(),
  }),
])

const teamSpecSchema = z.object({
  name: z.string().describe("Team name (filesystem-safe)"),
  description: z.string().optional(),
  lead: z
    .object({
      kind: z.literal("subagent_type"),
      subagent_type: z.enum(["aion", "requirements-analyst", "coder"]),
    })
    .optional(),
  members: z.array(memberSchema).min(1),
})

export type TeamToolset = {
  team_create: import("@opencode-ai/plugin").ToolDefinition
  team_delete: import("@opencode-ai/plugin").ToolDefinition
  team_shutdown_request: import("@opencode-ai/plugin").ToolDefinition
  team_approve_shutdown: import("@opencode-ai/plugin").ToolDefinition
  team_reject_shutdown: import("@opencode-ai/plugin").ToolDefinition
  team_send_message: import("@opencode-ai/plugin").ToolDefinition
  team_status: import("@opencode-ai/plugin").ToolDefinition
  team_list: import("@opencode-ai/plugin").ToolDefinition
  team_task_create: import("@opencode-ai/plugin").ToolDefinition
  team_task_list: import("@opencode-ai/plugin").ToolDefinition
  team_task_get: import("@opencode-ai/plugin").ToolDefinition
  team_task_update: import("@opencode-ai/plugin").ToolDefinition
  team_inbox: import("@opencode-ai/plugin").ToolDefinition
  team_inbox_ack: import("@opencode-ai/plugin").ToolDefinition
}

export function createTeamTools(args: {
  directory: string
  teamMode: TeamModeConfig
  trace: { appendEvent: (event: string, data: Record<string, unknown>) => void }
}) {
  const baseDir = resolveTeamBaseDir(args.directory, args.teamMode.baseDir)
  const coordinator = new TeamCoordinator(baseDir, args.teamMode)
  let initialized = false
  const ensureInit = async () => {
    if (!initialized) {
      await coordinator.init()
      initialized = true
    }
  }

  const team_create = tool({
    description: [
      "Spawn a new team runtime. Persists the spec under `<project>/.aion/teams/{name}/config.json`",
      "and creates runtime state under `<project>/.aion/runtime/{teamRunId}/`.",
      "Hard-reject agents (ts-critic, c-critic) cannot be members. Returns teamRunId.",
    ].join(" "),
    args: {
      spec: teamSpecSchema,
      createdBy: z.string().describe("Calling member name (must match an existing member or 'lead')"),
    },
    async execute(input, _ctx) {
      if (!args.teamMode.enabled) {
        throw new Error("team_mode is disabled in .opencode/aion.jsonc")
      }
      await ensureInit()
      const spec: TeamSpec = {
        name: input.spec.name,
        description: input.spec.description,
        lead: input.spec.lead
          ? {
              kind: "subagent_type",
              subagentType: input.spec.lead.subagent_type,
            }
          : undefined,
        members: input.spec.members.map((m): TeamMemberEntry => {
          if (m.kind === "subagent_type") {
            return {
              name: m.name,
              kind: "subagent_type",
              subagentType: m.subagent_type,
              prompt: m.prompt,
              worktreePath: m.worktreePath,
              isLead: m.isLead,
            }
          }
          return {
            name: m.name,
            kind: "category",
            category: m.category,
            prompt: m.prompt,
            worktreePath: m.worktreePath,
            isLead: m.isLead,
          }
        }),
      }
      const { state } = await coordinator.createTeam({ spec, createdBy: input.createdBy })
      await args.trace.appendEvent("team.create", {
        teamName: state.teamName,
        teamRunId: state.teamRunId,
        memberCount: state.members.length,
      })

      let tmuxResult: { ok: boolean; error?: string; script?: string } | undefined
      if (args.teamMode.tmuxVisualization) {
        const layout = layoutForMembers(state.members, state.teamRunId)
        const script = generateTmuxScript(layout)
        const tmuxOk = await isTmuxAvailable()
        if (tmuxOk) {
          const created = await createTmuxSession(layout)
          tmuxResult = { ok: created.ok, error: created.error, script }
        } else {
          tmuxResult = { ok: false, error: "tmux not available on PATH", script }
        }
      }

      return JSON.stringify(
        {
          ok: true,
          teamRunId: state.teamRunId,
          teamName: state.teamName,
          members: state.members.map((m) => ({ name: m.name, isLead: m.isLead, kind: m.kind })),
          maxParallelMembers: state.maxParallelMembers,
          maxWallClockMinutes: state.maxWallClockMinutes,
          mailboxPollIntervalMs: args.teamMode.mailboxPollIntervalMs,
          tmux: tmuxResult,
        },
        null,
        2,
      )
    },
  })

  const team_delete = tool({
    description:
      "Tear down a team runtime. Lead only. Rejects when any member is still active or starting. Use team_shutdown_request first.",
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name; must be lead"),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const state = await coordinator.getStatus(input.teamRunId)
      if (!state) throw new Error(`no such teamRunId ${input.teamRunId}`)
      const lead = state.members.find((m) => m.isLead)
      if (!lead || lead.name !== input.from) {
        throw new Error("only lead may delete the team")
      }
      const result = await coordinator.deleteTeam(input.teamRunId)
      if (!result.ok) throw new Error(result.reason)
      await args.trace.appendEvent("team.delete", { teamRunId: input.teamRunId })
      return JSON.stringify({ ok: true, teamRunId: input.teamRunId }, null, 2)
    },
  })

  const team_shutdown_request = tool({
    description:
      "Lead requests a member to wrap up. Member moves to 'shutdown_requested' state and must ack via team_approve_shutdown or team_reject_shutdown.",
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name; must be lead"),
      member: z.string().describe("Target member to shut down"),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const state = await coordinator.requestShutdown({
        teamRunId: input.teamRunId,
        from: input.from,
        member: input.member,
      })
      await args.trace.appendEvent("team.shutdown_request", {
        teamRunId: input.teamRunId,
        member: input.member,
      })
      return JSON.stringify(
        {
          ok: true,
          teamRunId: state.teamRunId,
          pendingShutdown: state.pendingShutdown,
        },
        null,
        2,
      )
    },
  })

  const team_approve_shutdown = tool({
    description:
      "Member or lead acknowledges the shutdown request. Target member transitions to 'shut_down'.",
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name"),
      member: z.string().describe("Target member to mark as shut down"),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const state = await coordinator.approveShutdown({
        teamRunId: input.teamRunId,
        from: input.from,
        member: input.member,
      })
      await args.trace.appendEvent("team.approve_shutdown", {
        teamRunId: input.teamRunId,
        member: input.member,
      })
      return JSON.stringify(
        {
          ok: true,
          teamRunId: state.teamRunId,
          status: state.members.find((m) => m.name === input.member)?.status,
          activeCount: state.activeCount,
        },
        null,
        2,
      )
    },
  })

  const team_reject_shutdown = tool({
    description:
      "Member rejects the shutdown request and may provide a reason. The reason is auto-pended to the lead's mailbox.",
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name"),
      member: z.string().describe("Target member refusing shutdown"),
      reason: z.string().optional(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const state = await coordinator.rejectShutdown({
        teamRunId: input.teamRunId,
        from: input.from,
        member: input.member,
        reason: input.reason,
      })
      await args.trace.appendEvent("team.reject_shutdown", {
        teamRunId: input.teamRunId,
        member: input.member,
      })
      return JSON.stringify({ ok: true, teamRunId: state.teamRunId }, null, 2)
    },
  })

  const team_send_message = tool({
    description: [
      "Send a peer-to-peer message through the team's mailbox.",
      "Lead may also broadcast (to='broadcast') to every member.",
      "Recipients are atomic per-message files under inboxes/{member}/{uuid}.json.",
    ].join(" "),
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name (sender)"),
      to: z.string().describe("Recipient member name, or 'broadcast' for lead-only broadcast"),
      subject: z.string(),
      body: z.string(),
      kind: z
        .enum(["task", "info", "ack", "shutdown", "shutdown-ack", "shutdown-nack", "task-claim", "task-report"])
        .default("info"),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const result = await coordinator.sendMessage({
        teamRunId: input.teamRunId,
        from: input.from,
        to: input.to,
        subject: input.subject,
        body: input.body,
        kind: input.kind,
      })
      await args.trace.appendEvent("team.send_message", {
        teamRunId: input.teamRunId,
        from: input.from,
        to: input.to,
        kind: input.kind,
        size: Buffer.byteLength(input.body, "utf-8"),
      })
      return JSON.stringify(
        {
          ok: true,
          messageId: result.message.id,
          deliveredTo: result.deliveredTo,
          broadcast: result.broadcast,
        },
        null,
        2,
      )
    },
  })

  const team_status = tool({
    description:
      "Aggregate runtime view of one team: members, active count, pending shutdown requests, message count.",
    args: {
      teamRunId: z.string(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const state = await coordinator.getStatus(input.teamRunId)
      if (!state) throw new Error(`no such teamRunId ${input.teamRunId}`)
      return JSON.stringify(
        {
          ...state,
          mailboxPollIntervalMs: args.teamMode.mailboxPollIntervalMs,
        },
        null,
        2,
      )
    },
  })

  const team_list = tool({
    description:
      "Declared team specs (under .aion/teams/) and active runtime runs (under .aion/runtime/).",
    args: {},
    async execute() {
      await ensureInit()
      const result = await coordinator.listTeams()
      return JSON.stringify(result, null, 2)
    },
  })

  const team_task_create = tool({
    description:
      "Append a task to the shared task list. Other members may claim it via team_task_update with status='claimed'.",
    args: {
      teamRunId: z.string(),
      from: z.string().describe("Calling member name"),
      title: z.string(),
      description: z.string(),
      priority: z.number().int().min(1).max(10).default(5),
      dependencies: z.array(z.string()).default([]),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const task = await coordinator.createTask({
        teamRunId: input.teamRunId,
        from: input.from,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dependencies: input.dependencies,
      })
      await args.trace.appendEvent("team.task_create", {
        teamRunId: input.teamRunId,
        taskId: task.id,
        title: task.title,
      })
      return JSON.stringify({ ok: true, task }, null, 2)
    },
  })

  const team_task_list = tool({
    description: "List all tasks for a team, oldest first.",
    args: {
      teamRunId: z.string(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const tasks = await coordinator.listTasks(input.teamRunId)
      return JSON.stringify({ ok: true, tasks }, null, 2)
    },
  })

  const team_task_get = tool({
    description: "Fetch one task by id.",
    args: {
      teamRunId: z.string(),
      taskId: z.string(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const task = await coordinator.getTask(input.teamRunId, input.taskId)
      if (!task) throw new Error(`no such task ${input.taskId}`)
      return JSON.stringify({ ok: true, task }, null, 2)
    },
  })

  const team_task_update = tool({
    description: [
      "Update task status. Claiming a task (status='claimed') records owner=from.",
      "Result summary should be appended when marking 'done'.",
    ].join(" "),
    args: {
      teamRunId: z.string(),
      taskId: z.string(),
      from: z.string().describe("Calling member name; recorded as owner when claiming"),
      status: z.enum(["open", "claimed", "in_progress", "done", "blocked", "cancelled"]),
      blockedReason: z.string().optional(),
      resultSummary: z.string().optional(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const patch: { status?: "open" | "claimed" | "in_progress" | "done" | "blocked" | "cancelled"; owner?: string; blockedReason?: string; resultSummary?: string } = {
        status: input.status,
      }
      if (input.status === "claimed" || input.status === "in_progress") {
        patch.owner = input.from
      }
      if (input.blockedReason) patch.blockedReason = input.blockedReason
      if (input.resultSummary) patch.resultSummary = input.resultSummary
      const task = await coordinator.updateTask(input.teamRunId, input.taskId, patch)
      if (!task) throw new Error(`no such task ${input.taskId}`)
      await args.trace.appendEvent("team.task_update", {
        teamRunId: input.teamRunId,
        taskId: input.taskId,
        status: input.status,
        owner: task.owner,
      })
      return JSON.stringify({ ok: true, task }, null, 2)
    },
  })

  const team_inbox = tool({
    description: [
      "Poll the calling member's inbox for unread messages.",
      "Reservations (.delivering-*.json) older than 10 minutes are auto-reclaimed.",
    ].join(" "),
    args: {
      teamRunId: z.string(),
      member: z.string().describe("Calling member name; only this member may poll its own inbox"),
    },
    async execute(input, _ctx) {
      await ensureInit()
      const messages = await coordinator.pollInbox({
        teamRunId: input.teamRunId,
        member: input.member,
      })
      return JSON.stringify({ ok: true, count: messages.length, messages }, null, 2)
    },
  })

  const team_inbox_ack = tool({
    description: "Mark one message as read and move it to processed/. Idempotent.",
    args: {
      teamRunId: z.string(),
      member: z.string(),
      messageId: z.string(),
    },
    async execute(input, _ctx) {
      await ensureInit()
      await coordinator.acknowledgeMessage({
        teamRunId: input.teamRunId,
        member: input.member,
        messageId: input.messageId,
      })
      return JSON.stringify({ ok: true }, null, 2)
    },
  })

  return {
    "team_create": team_create,
    "team_delete": team_delete,
    "team_shutdown_request": team_shutdown_request,
    "team_approve_shutdown": team_approve_shutdown,
    "team_reject_shutdown": team_reject_shutdown,
    "team_send_message": team_send_message,
    "team_status": team_status,
    "team_list": team_list,
    "team_task_create": team_task_create,
    "team_task_list": team_task_list,
    "team_task_get": team_task_get,
    "team_task_update": team_task_update,
    "team_inbox": team_inbox,
    "team_inbox_ack": team_inbox_ack,
  } as const as TeamToolset
}

export type TeamToolName = keyof TeamToolset
