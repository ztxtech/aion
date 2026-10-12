/**
 * TUI toast notifier for aion diagnostics and personality quips.
 *
 * Two delivery channels, picked automatically:
 *  1. Legacy hosts (OpenCode V1, unit tests): the plugin context carries a
 *     `client.tui.showToast` — call it directly.
 *  2. OpenCode V2: the server context has no TUI handle, so the toast is
 *     appended to the disk queue (`shared/toast-queue.ts`) which the TUI
 *     plugin polls and renders through `context.ui.toast.show`.
 *
 * Design constraints:
 *  - Must NEVER throw. The caller path is hot and already does its own work;
 *    a toast failure must not propagate.
 *  - Must be cheap. No awaits in the hot path that don't need them.
 *  - Must feature-gate itself: only a curated set of "user must notice"
 *    diagnostics call this, and personality has its own config gate.
 */

import { enqueueToast, type ToastVariant } from "./toast-queue"

export type { ToastVariant }

export type AionClient = {
  tui?: {
    showToast?: (input: {
      body?: { title?: string; message: string; variant: ToastVariant; duration?: number }
    }) => Promise<{ data?: boolean } | unknown> | unknown
  }
} | undefined

export type NotifyInput = {
  variant: ToastVariant
  title?: string
  message: string
  duration?: number
}

export type NotifyTarget = {
  client?: AionClient
  directory?: string
}

const DEFAULT_DURATION_MS = 5000

/**
 * Fire-and-forget toast. Errors are swallowed.
 * Returns true if the toast was actually issued (legacy call or queue write),
 * false when no channel is available (headless server without directory).
 */
export function notifyTui(target: NotifyTarget | undefined, input: NotifyInput): boolean {
  const showToast = target?.client?.tui?.showToast
  const body = {
    title: input.title,
    message: input.message,
    variant: input.variant,
    duration: input.duration ?? DEFAULT_DURATION_MS,
  }

  if (typeof showToast === "function") {
    try {
      const ret = showToast({ body })
      // Some clients return a promise; swallow rejections async without blocking.
      if (ret && typeof (ret as Promise<unknown>).then === "function") {
        ;(ret as Promise<unknown>).catch(() => {
          /* intentionally swallowed */
        })
      }
      return true
    } catch {
      return false
    }
  }

  if (target?.directory) {
    return enqueueToast(target.directory, body) !== null
  }
  return false
}

/**
 * Convenience: notify from a plugin context (`ctx.client` / `ctx.directory`
 * may be undefined in tests). Same return semantics as notifyTui.
 */
export function notifyFromCtx(ctx: NotifyTarget | undefined, input: NotifyInput): boolean {
  return notifyTui(ctx, input)
}
