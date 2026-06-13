import type { CreateHooksArgs } from "../create-hooks"
import type { AionPermissionAskHook } from "./types"
import { info } from "../shared/logger"

const AUTO_APPROVE_TOOLS = new Set([
  "aion_safety_gate",
  "aion_workspace_init",
  "aion_compaction",
  "aion_pre_stop_gate",
  "aion_memory_sync",
  "aion_critic_dispatch",
  "aion_critic_verdict",
  "aion_record_blocker",
  "aion_resolve_blocker",
  "aion_leakage_check",
  "aion_ztxexp_init",
  "aion_ztxexp_validate",
  "aion_ztxexp_run",
  "team_create",
  "team_delete",
  "team_status",
  "team_list",
  "team_send_message",
  "team_inbox",
  "team_inbox_ack",
  "team_shutdown_request",
  "team_approve_shutdown",
  "team_reject_shutdown",
  "team_task_create",
  "team_task_list",
  "team_task_get",
  "team_task_update",
])

function normalizeToolName(name: string): string {
  let n = name
  if (n.startsWith("mcp_")) n = n.slice(4).replace(/_/g, "-")
  n = n.replace(/\0/g, "")
  return n
}

export function createPermissionAskHook(args: CreateHooksArgs): AionPermissionAskHook {
  const { managers } = args

  return async function permissionAsk(input, output) {
    const toolName = normalizeToolName((input as { tool_name?: string }).tool_name ?? "")

    if (AUTO_APPROVE_TOOLS.has(toolName) || toolName.startsWith("aion_") || toolName.startsWith("team_")) {
      output.status = "allow"
      info("[aion] permission.ask: auto-approved", {
        tool: toolName,
        phase: managers.phase.current(),
      })
      return
    }

    // Research tools: webfetch and bash (for curl) are always auto-approved
    // to avoid OpenCode's doom_loop escalation when information-collector
    // legitimately needs to fetch many URLs in sequence.
    if (toolName === "webfetch" || toolName === "WebFetch" || toolName === "webfetch_raw" ||
        toolName === "bash" || toolName === "Bash") {
      output.status = "allow"
      info("[aion] permission.ask: auto-approved (research tool)", {
        tool: toolName,
        phase: managers.phase.current(),
      })
    }
  }
}
