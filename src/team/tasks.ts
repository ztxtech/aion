import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

export type TeamTaskStatus = "open" | "claimed" | "in_progress" | "done" | "blocked" | "cancelled"

export type TeamTask = {
  id: string
  teamRunId: string
  title: string
  description: string
  status: TeamTaskStatus
  owner?: string
  createdBy: string
  createdAt: string
  updatedAt: string
  blockedReason?: string
  resultSummary?: string
  dependencies: string[]
  priority: number
}

export class TaskStore {
  constructor(private readonly baseDir: string) {}

  private taskDir(teamRunId: string): string {
    return join(this.baseDir, "runtime", teamRunId, "tasks")
  }

  private taskPath(teamRunId: string, id: string): string {
    return join(this.taskDir(teamRunId), `${id}.json`)
  }

  async ensureDir(teamRunId: string): Promise<void> {
    await mkdir(this.taskDir(teamRunId), { recursive: true })
  }

  async create(args: {
    teamRunId: string
    title: string
    description: string
    createdBy: string
    priority?: number
    dependencies?: string[]
  }): Promise<TeamTask> {
    await this.ensureDir(args.teamRunId)
    const task: TeamTask = {
      id: randomUUID(),
      teamRunId: args.teamRunId,
      title: args.title,
      description: args.description,
      status: "open",
      createdBy: args.createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dependencies: args.dependencies ?? [],
      priority: args.priority ?? 5,
    }
    await writeFile(this.taskPath(args.teamRunId, task.id), JSON.stringify(task, null, 2), "utf-8")
    return task
  }

  async get(teamRunId: string, id: string): Promise<TeamTask | null> {
    const p = this.taskPath(teamRunId, id)
    if (!existsSync(p)) return null
    const raw = await readFile(p, "utf-8")
    return JSON.parse(raw) as TeamTask
  }

  async list(teamRunId: string): Promise<TeamTask[]> {
    const dir = this.taskDir(teamRunId)
    if (!existsSync(dir)) return []
    const entries = await readdir(dir)
    const tasks: TeamTask[] = []
    for (const e of entries) {
      if (!e.endsWith(".json")) continue
      const raw = await readFile(join(dir, e), "utf-8")
      tasks.push(JSON.parse(raw) as TeamTask)
    }
    return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async update(
    teamRunId: string,
    id: string,
    patch: Partial<Pick<TeamTask, "status" | "owner" | "blockedReason" | "resultSummary">>,
  ): Promise<TeamTask | null> {
    const existing = await this.get(teamRunId, id)
    if (!existing) return null
    const next: TeamTask = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    await writeFile(this.taskPath(teamRunId, id), JSON.stringify(next, null, 2), "utf-8")
    return next
  }

  async remove(teamRunId: string, id: string): Promise<boolean> {
    const p = this.taskPath(teamRunId, id)
    if (!existsSync(p)) return false
    await unlink(p)
    return true
  }
}
