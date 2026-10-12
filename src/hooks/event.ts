/**
 * `event` hook — session lifecycle observer.
 *
 * Listens for session.created / session.idle / session.deleted /
 * session.error events, traces them to the event log, and fires the
 * personality entrance quip (TUI toast only — never pollutes the chat
 * context) when a new session is created.
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionEventHook } from "./types"

export function createEventHook(args: CreateHooksArgs): AionEventHook {
  const { managers, personality } = args
  const m = managers

  return async function onEvent(input) {
    const event = input.event
    if (!event) return
    const type = event.type ?? ""
    if (type === "session.created" || type === "session.idle" || type === "session.deleted" || type === "session.error") {
      m.trace.appendEvent(
        "file.written",
        `lifecycle: ${type}`,
        { type, properties: event.properties },
      )
    }
    if (type === "session.created") {
      // Entrance quip — toast only, no in-context pollution
      personality?.onSessionCreated()
    }
  }
}
