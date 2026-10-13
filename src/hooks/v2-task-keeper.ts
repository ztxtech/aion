export type V2TaskKeeperEvent = {
  id?: string
  created?: number
  type: string
  location?: {
    directory?: string
  }
  data?: {
    sessionID?: string
    reason?: string
    error?: unknown
  }
}

export type V2TaskKeeperDecision = {
  continue: boolean
  prompt?: string
}

export type V2TaskKeeperOptions = {
  eligible(sessionID: string): Promise<boolean>
  idle(input: { sessionID: string; eventID?: string }): Promise<V2TaskKeeperDecision>
  continueSession(input: { sessionID: string; prompt: string; eventID?: string }): Promise<void>
  markInterrupted(sessionID: string, reason: string, interrupt?: boolean): void
  clearResume(sessionID: string): void
}

export function createV2TaskKeeper(options: V2TaskKeeperOptions) {
  const executing = new Set<string>()
  const settled = new Set<string>()
  const inFlight = new Set<string>()

  async function settle(sessionID: string, eventID?: string): Promise<boolean> {
    if (settled.has(sessionID) || inFlight.has(sessionID)) return false
    inFlight.add(sessionID)
    try {
      const decision = await options.idle({ sessionID, eventID })
      if (!decision.continue || !decision.prompt) {
        settled.add(sessionID)
        return false
      }
      await options.continueSession({ sessionID, prompt: decision.prompt, eventID })
      settled.add(sessionID)
      return true
    } finally {
      inFlight.delete(sessionID)
    }
  }

  return {
    async handle(event: V2TaskKeeperEvent): Promise<boolean> {
      const sessionID = event.data?.sessionID
      if (!sessionID) return false
      if (!(await options.eligible(sessionID))) return false

      if (event.type === "session.execution.started") {
        executing.add(sessionID)
        settled.delete(sessionID)
        options.clearResume(sessionID)
        return false
      }

      if (event.type === "session.execution.interrupted") {
        executing.delete(sessionID)
        const reason = event.data?.reason || "execution interrupted"
        const userStopped = reason === "user" || reason === "superseded" || reason === "shutdown"
        if (userStopped) {
          settled.add(sessionID)
          options.markInterrupted(sessionID, reason, true)
          return false
        }
        options.markInterrupted(sessionID, reason, false)
        return settle(sessionID, event.id)
      }

      if (event.type === "session.execution.failed") {
        executing.delete(sessionID)
        const reason = event.data?.error
          ? `execution failed: ${JSON.stringify(event.data.error)}`
          : "execution failed"
        options.markInterrupted(sessionID, reason, false)
        return settle(sessionID, event.id)
      }

      if (event.type !== "session.execution.succeeded" && event.type !== "session.idle") return false
      executing.delete(sessionID)
      return settle(sessionID, event.id)
    },
  }
}
