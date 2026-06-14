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
        "Record the user's preference for interactive mode. MUST be called AFTER using OpenCode's built-in 'question' tool to gather the user's answer, OR when the user explicitly says they want to leave / switch modes mid-conversation. Supports 4 granularity levels: autonomous (fully auto), round-checkpoint (pause after c-critic verdicts), always-interactive (pause at every major decision), custom (user-defined triggers).",
      args: {
        enabled: z.boolean().describe("true = interactive (loop pauses to ask user), false = autonomous (loop runs fully auto)"),
        granularity: z.enum(["autonomous", "round-checkpoint", "always-interactive", "custom"]).optional().describe(
          "autonomous = fully auto, no prompts. " +
          "round-checkpoint = pause after c-critic verdicts only. " +
          "always-interactive = pause at every dispatch, critic verdict, plan switch, phase transition. " +
          "custom = user defines their own triggers (see customTriggers). " +
          "If omitted, defaults to 'round-checkpoint' when enabled=true, 'autonomous' when enabled=false."
        ),
        customTriggers: z.array(z.string()).optional().describe(
          "When granularity=custom, list of trigger keywords. Valid triggers: 'c-critic-verdict', 'dispatch', 'plan-switch', 'phase-transition', 'critic-reject'. " +
          "The loop will pause and ask the user when any of these events occur."
        ),
        reason: z
          .string()
          .optional()
          .describe("Why the user set this (e.g. 'user said they want to leave', 'session start answer: autonomous')"),
      },
      async execute(args, _context) {
        const previous = m.state.governance.interactiveModeResolved
        const source = previous === "unset" ? "session-start" : "user-toggle"
        const newValue: "interactive" | "autonomous" = args.enabled ? "interactive" : "autonomous"
        m.interactiveMode.resolve(newValue, source, {
          granularity: args.granularity,
          customTriggers: args.customTriggers,
        })

        // Reset any pending continue/stop decision so future c-critic verdicts re-prompt.
        m.userContinue.reset()

        const granularity = m.interactiveMode.getGranularity()
        const effectMap: Record<string, string> = {
          "autonomous": "Loop will RUN AUTONOMOUSLY. No user prompts between rounds. c-critic + pre-stop-gate are the only stop gates.",
          "round-checkpoint": "Loop will PAUSE after every c-critic verdict and ask the user whether to continue.",
          "always-interactive": "Loop will PAUSE at every major decision: dispatch, critic verdict, plan switch, phase transition.",
          "custom": `Loop will PAUSE when these triggers fire: ${m.interactiveMode.getCustomTriggers().join(", ") || "(none — effectively autonomous)"}`,
        }

        return JSON.stringify(
          {
            recorded: true,
            previousMode: previous,
            newMode: newValue,
            granularity,
            customTriggers: m.interactiveMode.getCustomTriggers(),
            source,
            effect: effectMap[granularity] ?? effectMap["autonomous"],
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
