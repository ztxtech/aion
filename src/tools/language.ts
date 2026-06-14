/**
 * Language mode tool.
 *
 * `aion_set_language` — records the user's language preference for
 * interaction, reasoning, and delivery. Called after the `question`
 * tool gathers the user's answer at session start, or when the user
 * toggles language mid-conversation.
 *
 * TUI notifications (personality quips like "I AM AION") always stay
 * in English regardless of this setting — they are visual ambiance,
 * not content the user needs to read carefully.
 */
import { tool } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"

export function createLanguageTool(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_set_language: tool({
      description:
        "Record the user's language preference. MUST be called AFTER using OpenCode's built-in 'question' tool to gather the user's answer at session start, OR when the user explicitly asks to switch language mid-conversation. TUI notifications always stay in English regardless of this setting.",
      args: {
        mode: z.enum(["en", "zh-reason-en-deliver", "zh-deliver", "bilingual"]).describe(
          "en = English everywhere. " +
          "zh-reason-en-deliver = Chinese for interaction and reasoning, English for final code and delivery. " +
          "zh-deliver = Chinese delivery throughout. " +
          "bilingual = Chinese and English delivery (both produced)."
        ),
        reason: z
          .string()
          .optional()
          .describe("Why the user set this (e.g. 'user selected Chinese at session start')"),
      },
      async execute(args, _context) {
        const previous = m.state.governance.languageResolved
        const source = previous === "unset" ? "session-start" : "user-toggle"
        m.language.resolve(args.mode, source)

        const effectMap: Record<string, string> = {
          "en": "All interaction, reasoning, and delivery will be in English.",
          "zh-reason-en-deliver": "Interaction and reasoning in Chinese. Final code, API names, and delivery artifacts in English.",
          "zh-deliver": "All delivery in Chinese.",
          "bilingual": "Delivery in both Chinese and English.",
        }

        return JSON.stringify(
          {
            recorded: true,
            previousMode: previous,
            newMode: args.mode,
            source,
            effect: effectMap[args.mode] ?? effectMap["en"],
            reason: args.reason ?? null,
            note: "TUI notifications (I AM AION quips) always stay in English.",
            nextAction: "Now respond to the user briefly and continue with their original request using the chosen language.",
          },
          null,
          2,
        )
      },
    }),
  }
}
