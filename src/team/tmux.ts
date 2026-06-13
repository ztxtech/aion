import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { TeamRuntimeState } from "./store"

const execFileAsync = promisify(execFile)

export type TmuxLayoutPane = {
  memberName: string
  paneId?: string
}

export type TmuxLayout = {
  sessionName: string
  windowName: string
  panes: TmuxLayoutPane[]
}

function escapeTmuxName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_")
}

function layoutForMembers(members: TeamRuntimeState["members"], teamRunId: string): TmuxLayout {
  const sessionName = `aion-${escapeTmuxName(teamRunId)}`
  const windowName = "team"
  const panes: TmuxLayoutPane[] = members.map((m) => ({
    memberName: m.name,
  }))
  return { sessionName, windowName, panes }
}

export function isCmuxEnvironment(): boolean {
  return !!process.env.CMUX_SOCKET_PATH
}

export async function isTmuxAvailable(): Promise<boolean> {
  if (isCmuxEnvironment()) return true
  try {
    await execFileAsync("tmux", ["-V"])
    return true
  } catch {
    return false
  }
}

export async function createTmuxSession(layout: TmuxLayout): Promise<{ ok: boolean; error?: string }> {
  if (layout.panes.length === 0) {
    return { ok: false, error: "no members to create panes for" }
  }

  const tmuxBin = isCmuxEnvironment() ? "cmux" : "tmux"
  const tmuxArgs = isCmuxEnvironment() ? ["__tmux-compat"] : []

  try {
    if (isCmuxEnvironment()) {
      await execFileAsync("cmux", ["__tmux-compat", "new-session", "-d", "-s", layout.sessionName, "-x", "220", "-y", "50"])
    } else {
      await execFileAsync("tmux", ["new-session", "-d", "-s", layout.sessionName, "-x", "220", "-y", "50"])
    }

    for (let i = 1; i < layout.panes.length; i++) {
      if (isCmuxEnvironment()) {
        await execFileAsync("cmux", ["__tmux-compat", "split-window", "-t", layout.sessionName, "-h"])
      } else {
        await execFileAsync("tmux", ["split-window", "-t", layout.sessionName, "-h"])
      }
    }

    for (let i = 0; i < layout.panes.length; i++) {
      const cmd = isCmuxEnvironment()
        ? ["__tmux-compat", "send-keys", "-t", `${layout.sessionName}:${i}`, `# ${layout.panes[i].memberName}`, "Enter"]
        : ["send-keys", "-t", `${layout.sessionName}:${i}`, `# ${layout.panes[i].memberName}`, "Enter"]
      await execFileAsync(isCmuxEnvironment() ? "cmux" : "tmux", cmd)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}

export async function destroyTmuxSession(sessionName: string): Promise<{ ok: boolean }> {
  try {
    if (isCmuxEnvironment()) {
      await execFileAsync("cmux", ["__tmux-compat", "kill-session", "-t", sessionName])
    } else {
      await execFileAsync("tmux", ["kill-session", "-t", sessionName])
    }
    return { ok: true }
  } catch {
    return { ok: true }
  }
}

export function generateTmuxScript(layout: TmuxLayout): string {
  const lines: string[] = [
    "#!/bin/bash",
    "# AION team-mode tmux layout script",
    `SESSION="${layout.sessionName}"`,
    "",
  ]

  if (isCmuxEnvironment()) {
    lines.push(
      'cmux __tmux-compat kill-session -t "$SESSION" 2>/dev/null || true',
      `cmux __tmux-compat new-session -d -s "$SESSION" -x 220 -y 50`,
    )
    for (let i = 1; i < layout.panes.length; i++) {
      lines.push(`cmux __tmux-compat split-window -t "$SESSION" -h`)
    }
    for (let i = 0; i < layout.panes.length; i++) {
      lines.push(`cmux __tmux-compat send-keys -t "$SESSION":${i} '# ${layout.panes[i].memberName}' Enter`)
    }
  } else {
    lines.push(
      'tmux kill-session -t "$SESSION" 2>/dev/null || true',
      `tmux new-session -d -s "$SESSION" -x 220 -y 50`,
    )
    for (let i = 1; i < layout.panes.length; i++) {
      lines.push(`tmux split-window -t "$SESSION" -h`)
    }
    for (let i = 0; i < layout.panes.length; i++) {
      lines.push(`tmux send-keys -t "$SESSION":${i} '# ${layout.panes[i].memberName}' Enter`)
    }
  }

  if (!isCmuxEnvironment()) {
    lines.push(`tmux attach-session -t "$SESSION"`)
  }

  return lines.join("\n")
}

export { layoutForMembers }