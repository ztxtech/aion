/**
 * Interactive-mode tool.
 *
 * `aion_set_interactive_mode` — records the user's choice between
 * interactive (loop pauses for user between c-critic verdicts) and
 * autonomous (loop runs fully auto). Must be called after the `question`
 * tool gathers the user's answer, or when the user toggles mode
 * mid-conversation. Resets the pending continue/stop decision so future
 * c-critic verdicts re-prompt in interactive mode.
 */
import { tool } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"

export function createInteractiveModeTool(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_set_interactive_mode: tool({
      description:
        "Record the user's preference for interactive mode (whether the loop pauses for the user between c-critic verdicts). MUST be called AFTER using OpenCode's built-in 'question' tool to gather the user's answer, OR when the user explicitly says they want to leave / switch modes mid-conversation. Once resolved, this binding is fixed for the rest of the session unless the user explicitly toggles it again.",
      args: {
        enabled: z.boolean().describe("true = interactive (loop pauses to ask user between rounds), false = autonomous (loop runs fully auto)"),
        reason: z
          .string()
          .optional()
          .describe("Why the user set this (e.g. 'user said they want to leave', 'session start answer: autonomous', 'user said they want to be asked')"),
      },
      async execute(args, _context) {
        const previous = m.state.governance.interactiveModeResolved
        const source = previous === "unset" ? "session-start" : "user-toggle"
        const newValue: "interactive" | "autonomous" = args.enabled ? "interactive" : "autonomous"
        m.interactiveMode.resolve(newValue, source)

        // Reset any pending continue/stop decision so future c-critic verdicts re-prompt.
        m.userContinue.reset()

        return JSON.stringify(
          {
            recorded: true,
            previousMode: previous,
            newMode: newValue,
            source,
            effect: newValue === "interactive"
              ? "Loop will PAUSE after every c-critic verdict and ask the user whether to continue."
              : "Loop will RUN AUTONOMOUSLY. No user prompts between rounds. c-critic + pre-stop-gate are the only stop gates.",
            reason: args.reason ?? null,
            nextAction: "Now respond to the user briefly and continue with their original request using the chosen mode.",
          },
          null,
          2,
        )
      },
    }),
  }
}
