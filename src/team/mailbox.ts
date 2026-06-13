import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

export type MailboxMessage = {
  id: string
  teamRunId: string
  from: string
  to: string | "broadcast"
  subject: string
  body: string
  kind: "task" | "info" | "ack" | "shutdown" | "shutdown-ack" | "shutdown-nack" | "task-claim" | "task-report"
  createdAt: string
  readBy: string[]
  meta?: Record<string, unknown>
}

const RESERVATION_TTL_MS = 10 * 60 * 1000

export class MailboxStore {
  constructor(private readonly baseDir: string) {}

  private inboxDir(teamRunId: string, member: string): string {
    return join(this.baseDir, "runtime", teamRunId, "inboxes", member)
  }

  private processedDir(teamRunId: string, member: string): string {
    return join(this.inboxDir(teamRunId, member), "processed")
  }

  async ensureLayout(teamRunId: string, members: string[]): Promise<void> {
    for (const m of members) {
      await mkdir(this.processedDir(teamRunId, m), { recursive: true })
    }
  }

  async send(
    args: Omit<MailboxMessage, "id" | "createdAt" | "readBy">,
  ): Promise<MailboxMessage> {
    const msg: MailboxMessage = {
      ...args,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      readBy: [],
    }
    const recipients = args.to === "broadcast" ? await this.allMembers(args.teamRunId) : [args.to]
    for (const r of recipients) {
      await this.ensureLayout(args.teamRunId, [r])
      const target = join(this.inboxDir(args.teamRunId, r), `${msg.id}.json`)
      await writeFile(target, JSON.stringify(msg, null, 2), "utf-8")
    }
    return msg
  }

  async listUnread(teamRunId: string, member: string): Promise<MailboxMessage[]> {
    const dir = this.inboxDir(teamRunId, member)
    if (!existsSync(dir)) return []
    const entries = await readdir(dir)
    const messages: MailboxMessage[] = []
    for (const entry of entries) {
      if (entry.startsWith(".")) continue
      if (entry === "processed") continue
      const full = join(dir, entry)
      try {
        const raw = await readFile(full, "utf-8")
        const msg = JSON.parse(raw) as MailboxMessage
        if (!msg.readBy.includes(member)) messages.push(msg)
      } catch {
        // skip broken entries
      }
    }
    return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async reserve(
    teamRunId: string,
    member: string,
    messageId: string,
  ): Promise<boolean> {
    const src = join(this.inboxDir(teamRunId, member), `${messageId}.json`)
    const dst = join(this.inboxDir(teamRunId, member), `.delivering-${messageId}.json`)
    if (!existsSync(src)) return false
    await rename(src, dst)
    return true
  }

  async commit(
    teamRunId: string,
    member: string,
    messageId: string,
  ): Promise<void> {
    const reservation = join(
      this.inboxDir(teamRunId, member),
      `.delivering-${messageId}.json`,
    )
    const final = join(this.processedDir(teamRunId, member), `${messageId}.json`)
    if (existsSync(reservation)) {
      await rename(reservation, final)
    }
  }

  async release(
    teamRunId: string,
    member: string,
    messageId: string,
  ): Promise<void> {
    const reservation = join(
      this.inboxDir(teamRunId, member),
      `.delivering-${messageId}.json`,
    )
    const final = join(this.inboxDir(teamRunId, member), `${messageId}.json`)
    if (existsSync(reservation)) {
      await rename(reservation, final)
    }
  }

  async reclaimStale(teamRunId: string, member: string): Promise<number> {
    const dir = this.inboxDir(teamRunId, member)
    if (!existsSync(dir)) return 0
    const entries = await readdir(dir)
    let reclaimed = 0
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.startsWith(".delivering-")) continue
      const full = join(dir, entry)
      try {
        const stat = await import("node:fs/promises").then((m) => m.stat(full))
        if (now - stat.mtimeMs > RESERVATION_TTL_MS) {
          const id = entry.replace(/^\.delivering-/, "").replace(/\.json$/, "")
          await this.release(teamRunId, member, id)
          reclaimed++
        }
      } catch {
        // ignore
      }
    }
    return reclaimed
  }

  async markRead(
    teamRunId: string,
    member: string,
    messageId: string,
  ): Promise<void> {
    const reservation = join(
      this.inboxDir(teamRunId, member),
      `.delivering-${messageId}.json`,
    )
    const live = join(this.inboxDir(teamRunId, member), `${messageId}.json`)
    const target = existsSync(reservation) ? reservation : live
    if (!existsSync(target)) return
    const raw = await readFile(target, "utf-8")
    const msg = JSON.parse(raw) as MailboxMessage
    if (!msg.readBy.includes(member)) msg.readBy.push(member)
    await writeFile(target, JSON.stringify(msg, null, 2), "utf-8")
  }

  async unreadBytes(teamRunId: string, member: string): Promise<number> {
    const unread = await this.listUnread(teamRunId, member)
    return unread.reduce((acc, m) => acc + Buffer.byteLength(m.body, "utf-8"), 0)
  }

  private async allMembers(teamRunId: string): Promise<string[]> {
    const statePath = join(this.baseDir, "runtime", teamRunId, "state.json")
    if (!existsSync(statePath)) return []
    const raw = await readFile(statePath, "utf-8")
    const state = JSON.parse(raw) as { members: { name: string }[] }
    return state.members.map((m) => m.name)
  }
}
