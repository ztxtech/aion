/**
 * `aion_set_complexity` — record the task complexity tier for this
 * session. Called once at session start (or first non-trivial turn)
 * by the main agent, and again on escalation.
 *
 * Tier semantics (see src/scheduling/complexity.ts):
 *
 *   - LIGHT:  read-only / one-shot, main agent only.
 *   - MEDIUM: single concrete change, one worker + one ts-critic.
 *   - FULL:   full pipeline with c-critic gate.
 *
 * Escalation is allowed (LIGHT -> MEDIUM -> FULL). De-escalation is
 * rejected: if the main agent asks for a lower tier, the tool returns
 * an error explaining the no-downgrade policy. The reason: weaker
 * ceremony is a footgun, not a flexibility.
 *
 * The recorded tier drives:
 *   - G1 dispatch edge enforcement (tool-guard.ts via dispatch-rules.ts)
 *   - Session-idle hint generation (what to do next)
 *   - G2 main-writes-code strictness (which files the main agent may touch)
 *   - No-progress breaker threshold
 *
 * File location: src/tools/complexity.ts
 */

import { tool } from "../plugin/tool"
import type { CreateToolsArgs } from "./_shared"
import { COMPLEXITY_TIERS, isAllowedEscalation, type ComplexityTier } from "../scheduling/complexity"

// Note: `z` is the Zod namespace as re-exported by the SDK; we do not
// import it explicitly because the plugin SDK ships its own bundled
// zod. Following the pattern in src/tools/critic.ts (which uses
// z.enum, z.array, z.object without an explicit import).

/**
 * Return shape: a single-key object whose only key is `aion_set_complexity`.
 * The explicit Record return type prevents the SDK's bundled zod type
 * registry, while keeping AION tool implementations in their domain modules.
 */
type ComplexityTools = Record<"aion_set_complexity", ReturnType<typeof tool>>

export function createComplexityTool(args: CreateToolsArgs): ComplexityTools {
  const { managers } = args
  const m = managers
  // Use the SDK's bundled zod via tool.schema (the canonical pattern in
  // src/tools/*.ts). Avoids the version-mismatch error that hits when
  // `zod` is imported directly from the workspace root.
  const z = tool.schema
  const ZTier = z.enum(COMPLEXITY_TIERS)

  return {
    aion_set_complexity: tool({
      description:
        "Record the task complexity tier for this session. Called once " +
        "at session start (or first non-trivial turn); escalation allowed, " +
        "de-escalation rejected. Drives dispatch-edge enforcement, " +
        "session-idle hints, G2 main-writes-code strictness, and " +
        "no-progress breaker threshold.",
      args: {
        tier: ZTier.describe("Complexity tier: LIGHT, MEDIUM, or FULL."),
        reason: z
          .string()
          .min(1)
          .describe("One-sentence justification for the chosen tier (or escalation)."),
      },
      async execute(input, _context) {
        const requested = input.tier as ComplexityTier
        m.runtimeControl.refresh()
        const runtimeMode = m.runtimeControl.current()
        if (runtimeMode !== "AUTO") {
          return JSON.stringify(
            {
              recorded: false,
              reason: "user-locked-runtime-mode",
              runtimeMode,
              effectiveTier: m.runtimeControl.effectiveTier(),
              detail:
                "Execution mode is locked by /aion-mode. Use the locked dispatch rules; " +
                "only the user can change the mode.",
            },
            null,
            2,
          )
        }

        const previous = m.state.governance.complexityTier

        // First-time set always wins.
        if (previous === "unset" || previous === undefined) {
          m.state.governance.complexityTier = requested
          m.complexity.setTier(requested)
          m.trace.appendEvent(
            "dispatch.created",
            "complexity: " + requested + " (initial)",
            { tier: requested, reason: input.reason, previous: "unset" },
            "main-agent",
          )
          return JSON.stringify(
            {
              recorded: true,
              tier: requested,
              previousTier: "unset",
              escalation: false,
              effect:
                "Phase dispatch edges now use tier=" + requested +
                ". Follow the tier rules from src/scheduling/dispatch-rules.ts.",
            },
            null,
            2,
          )
        }

        // Subsequent set: must be a strict escalation.
        if (!isAllowedEscalation(previous, requested)) {
          m.trace.appendEvent(
            "governance.blocker",
            "complexity: de-escalation rejected",
            { requested, previous, reason: input.reason },
            "main-agent",
          )
          // The 2026-07-08 unit-test run showed the LLM trying to
          // de-escalate 2 times in a row when it got stuck in a
          // ts-critic loop. The original rejection just said "no";
          // the LLM had no actionable next step. The new hint
          // names the two legitimate ways out of the loop:
          // (1) escalate to FULL, or (2) document the no-go in
          // negative.md and transition to done.
          return JSON.stringify(
            {
              recorded: false,
              reason: "de-escalation-rejected",
              detail:
                "Cannot lower tier from " + previous + " to " + requested +
                ". AION allows escalation only (LIGHT -> MEDIUM -> FULL).",
              currentTier: previous,
              requestedTier: requested,
              hint: [
                "If the current tier feels too heavy, the correct response is to ESCALATE to " +
                  "the next tier up, not de-escalate. Higher ceremony gives the LLM more " +
                  "reviewer diversity and a clearer path to closure.",
                "If the harness is genuinely over-engineered for this task, document the " +
                  "no-go zone in negative.md and transition to done with a 'best effort' " +
                  "report. Closing is preferable to spinning forever at the wrong tier.",
                "If you truly believe a de-escalation is the only path forward, finish the " +
                  "current session and start a new one. The tier is per-session state, " +
                  "not per-call.",
              ].join(" "),
            },
            null,
            2,
          )
        }

        m.state.governance.complexityTier = requested
        m.complexity.setTier(requested)
        m.trace.appendEvent(
          "dispatch.created",
          "complexity: " + previous + " -> " + requested + " (escalation)",
          { tier: requested, previous, reason: input.reason },
          "main-agent",
        )
        return JSON.stringify(
          {
            recorded: true,
            tier: requested,
            previousTier: previous,
            escalation: true,
            effect:
              "Phase dispatch edges now use tier=" + requested +
              ". Worker progress is preserved across the escalation.",
          },
          null,
            2,
          )
      },
    }),
  }
}
