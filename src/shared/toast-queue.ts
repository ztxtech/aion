/**
 * Disk-backed toast queue — the server -> TUI bridge for OpenCode V2.
 *
 * The V2 server context has no TUI channel (V1's client.tui.showToast is
 * gone), so diagnostics and personality quips are appended to a small JSON
 * file that the TUI plugin polls and renders with context.ui.toast.show().
 *
 * Concurrency model: one writer (the server plugin) and one reader (the TUI
 * plugin) per workspace. Writes are atomic (temp file + rename) so the
 * reader never sees a torn file, and the queue is capped so it cannot grow
 * without bound. Every function swallows errors — the toast channel must
 * never break the caller.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export const TOAST_QUEUE_FILE = join(".opencode", "memory", "tui-toasts.json")
export const TOAST_QUEUE_VERSION = 1
export const TOAST_QUEUE_MAX = 50

export type ToastVariant = "info" | "success" | "warning" | "error"

export type QueuedToast = {
  id: number
  title?: string
  message: string
  variant: ToastVariant
  duration?: number
  createdAt: string
}

export type ToastQueue = {
  version: typeof TOAST_QUEUE_VERSION
  items: QueuedToast[]
}

export type ToastEnqueueInput = {
  message: string
  variant: ToastVariant
  title?: string
  duration?: number
}

const VARIANTS: readonly ToastVariant[] = ["info", "success", "warning", "error"]

function isQueuedToast(value: unknown): value is QueuedToast {
  if (!value || typeof value !== "object") return false
  const item = value as Partial<QueuedToast>
  return (
    typeof item.id === "number"
    && Number.isFinite(item.id)
    && typeof item.message === "string"
    && typeof item.variant === "string"
    && (VARIANTS as readonly string[]).includes(item.variant)
  )
}

function emptyQueue(): ToastQueue {
  return { version: TOAST_QUEUE_VERSION, items: [] }
}

export function toastQueuePath(root: string): string {
  return join(root, TOAST_QUEUE_FILE)
}

/**
 * Read the queue. Missing, corrupt, or partial files yield an empty queue —
 * a bad file must never crash the TUI.
 */
export function readToastQueue(root: string): ToastQueue {
  try {
    const parsed = JSON.parse(readFileSync(toastQueuePath(root), "utf8")) as {
      items?: unknown
    }
    if (!parsed || !Array.isArray(parsed.items)) return emptyQueue()
    return {
      version: TOAST_QUEUE_VERSION,
      items: parsed.items.filter(isQueuedToast),
    }
  } catch {
    return emptyQueue()
  }
}

/** Append a toast. Returns the queued item, or null when the write failed. */
export function enqueueToast(
  root: string,
  input: ToastEnqueueInput,
  options: { now?: Date } = {},
): QueuedToast | null {
  try {
    const file = toastQueuePath(root)
    const queue = readToastQueue(root)
    const item: QueuedToast = {
      id: (queue.items.at(-1)?.id ?? 0) + 1,
      title: input.title,
      message: input.message,
      variant: input.variant,
      duration: input.duration,
      createdAt: (options.now ?? new Date()).toISOString(),
    }
    const payload: ToastQueue = {
      version: TOAST_QUEUE_VERSION,
      items: [...queue.items, item].slice(-TOAST_QUEUE_MAX),
    }
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(payload))
    renameSync(tmp, file)
    return item
  } catch {
    return null
  }
}

/** Items the consumer has not rendered yet (id strictly greater than cursor). */
export function toastsAfter(queue: ToastQueue, cursor: number): QueuedToast[] {
  return queue.items.filter((item) => item.id > cursor)
}

export const TOAST_FRESH_GRACE_MS = 10_000

/**
 * Cursor a fresh consumer should start from. Items written before the grace
 * window are considered stale (a TUI restart must not replay yesterday's
 * toasts), while items written around process start (the boot entrance quip,
 * written microseconds before the TUI begins polling) are still delivered.
 */
export function initialToastCursor(
  queue: ToastQueue,
  options: { now?: number; graceMs?: number } = {},
): number {
  const cutoff = (options.now ?? Date.now()) - (options.graceMs ?? TOAST_FRESH_GRACE_MS)
  let cursor = 0
  for (const item of queue.items) {
    const written = Date.parse(item.createdAt)
    // Unparseable timestamps read as stale: replaying a phantom toast is
    // worse than dropping one, and our own writer always stamps valid ISO.
    if (!Number.isFinite(written) || written <= cutoff) cursor = item.id
  }
  return cursor
}
