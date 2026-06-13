/**
 * TUI toast notifier for aion diagnostics.
 *
 * Why this exists: aion produces many `warn(...)` lines via console.warn, but
 * TUI users see those as text in the scrolling log area, easily buried. The
 * OpenCode TUI also has a native toast channel (client.tui.showToast) that
 * renders a transient banner — perfect for the small set of "LLM must notice
 * this" diagnostics (leakage blocks, pre-stop-gate failures, etc.).
 *
 * Design constraints:
 *  - Must NEVER throw. The caller path is hot and already does its own work;
 *    a toast failure must not propagate.
 *  - Must be cheap. No awaits in the hot path that don't need them.
 *  - Must be feature-gated. Most warns stay in console; only a curated set of
 *    "important" diagnostics call this.
 *  - Must survive missing client (test env, headless server). Falls back
 *    silently to console.warn only.
 */

type TuiVariant = "info" | "success" | "warning" | "error"

export type AionClient = {
  tui?: {
    showToast?: (input: {
      body?: { title?: string; message: string; variant: TuiVariant; duration?: number }
    }) => Promise<{ data?: boolean } | unknown> | unknown
  }
} | undefined

export type NotifyInput = {
  variant: TuiVariant
  title?: string
  message: string
  duration?: number
}

const DEFAULT_DURATION_MS = 5000

/**
 * Fire-and-forget TUI toast. Errors are swallowed (console.warn only).
 * Returns true if the toast call was actually issued, false if the client
 * is missing / the channel is unavailable / we're in a non-TUI context.
 */
export function notifyTui(client: AionClient, input: NotifyInput): boolean {
  if (!client?.tui?.showToast) return false
  const body = {
    title: input.title,
    message: input.message,
    variant: input.variant,
    duration: input.duration ?? DEFAULT_DURATION_MS,
  }
  try {
    const ret = client.tui.showToast({ body })
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

/**
 * Convenience: notify from a plugin context (`ctx.client` may be undefined in
 * tests). Same return semantics as notifyTui.
 */
export function notifyFromCtx(
  ctx: { client?: AionClient } | undefined,
  input: NotifyInput,
): boolean {
  return notifyTui(ctx?.client, input)
}
