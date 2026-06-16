/**
 * Critic dispatch and verdict tools.
 *
 * `aion_critic_dispatch` — issue a structured review instruction to a
 *   critic subagent (ts-critic or c-critic), including the goal, the
 *   artifacts to review, and the expected verdict shape.
 * `aion_critic_verdict` — record a critic's stop signal / verdict. This
 *   drives the phase machine: a ts-critic verdict may transition
 *   ts-pre-review → implement; a c-critic approve-stop is the only signal
 *   that can lift the no-stop order. Also records blockers the critic
 *   identifies.
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"

export function createCriticTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_critic_dispatch: tool({
      description:
        "Prepare a critic review package. This tool DOES NOT dispatch the critic itself — it returns a structured instruction payload that you MUST pass to the `task` tool in the SAME turn to actually run the critic. Flow: (1) call aion_critic_dispatch('ts-critic' | 'c-critic', goal, evidence_artifacts) to get the dispatch payload; (2) IMMEDIATELY call task(subagent_type=<critic>, description=<goal>, prompt=<the returned instructions>) to actually run the critic subagent; (3) the task tool will block until the critic finishes and returns its verdict as a tool result; (4) then call aion_critic_verdict to record the verdict into governance state. Skipping step (2) means the critic never runs.",
      args: {
        critic: z.enum(["ts-critic", "c-critic"]),
        goal: z.string().describe("Specific question or goal for the critic"),
        evidence_artifacts: z.array(z.string()).default([]).describe("File paths the critic must read"),
        unresolved_blockers: z.array(z.string()).default([]).describe("Blocker IDs from a previous critic round"),
      },
      async execute(args, _context) {
        const dispatchId = `DISP-${Date.now()}`
        const goal = args?.goal ?? ""
        const evidence = args?.evidence_artifacts ?? []
        const unresolved = args?.unresolved_blockers ?? []
        m.trace.appendEvent(
          "critic.review",
          `${args.critic} dispatch prepared (dispatchId=${dispatchId}): ${goal.slice(0, 200)}`,
          {
            dispatchId,
            critic: args.critic,
            goal,
            evidence,
            unresolved_blockers: unresolved,
          },
          args.critic,
        )

        // Build the instruction payload that the main agent MUST pass to the
        // `task` tool. The task tool is the ONLY way to actually run a subagent
        // in OpenCode — this tool just prepares the prompt.
        const instructions = [
          `READ-ONLY: review the listed evidence_artifacts: ${evidence.join(", ") || "(none)"}`,
          `ANSWER: ${goal}`,
          unresolved.length > 0
            ? `REBUT unresolved_blockers: ${unresolved.join(", ")}`
            : "",
          `OUTPUT schema:`,
          `- verdict: allow-stop | absolutely-cannot-stop-now | rebuttal-mode | rollback`,
          `- unresolved_blockers: [{ id, description, evidence, forbidden_action, unblock_condition }]`,
          `- why_not_stop: explicit justification for not closing the task`,
          `- next_call: which agent / skill should be called next`,
        ].filter(Boolean).join("\n")

        return JSON.stringify(
          {
            dispatchId,
            critic: args.critic,
            status: "PAYLOAD_READY_NOT_DISPATCHED",
            warning: "The critic has NOT been dispatched yet. This tool only prepared the instruction payload.",
            next_action_required: `Call task(subagent_type="${args.critic}", description="${goal.slice(0, 120).replace(/"/g, "'")}", prompt=${JSON.stringify(instructions)}) NOW in this same turn. The task tool will block until the critic finishes. Do NOT end your turn without making this task call.`,
            instructions,
          },
          null,
          2,
        )
      },
    }),

    aion_critic_verdict: tool({
      description:
        "Submit a critic verdict. Use this to record a stop signal or blocker from ts-critic / c-critic into the governance state. Programming-level enforcement: until aion_critic_verdict('allow-stop') is called, the auto-continue hook will keep the session running.",
      args: {
        critic: z.enum(["ts-critic", "c-critic"]),
        verdict: z.enum([
          "allow-stop",
          "absolutely-cannot-stop-now",
          "rebuttal-mode",
          "rollback",
          "approve-stop",
          "reject-stop",
        ]),
        blockers: z
          .array(
            z.object({
              description: z.string(),
              evidence: z.string(),
              forbidden_action: z.string(),
              unblock_condition: z.string(),
            }),
          )
          .default([]),
        why_not_stop: z.string().default(""),
        next_call: z.string().default(""),
      },
      async execute(args, _context) {
        const blockers = args?.blockers ?? []
        const whyNotStop = args?.why_not_stop ?? ""
        const nextCall = args?.next_call ?? ""
        const signal =
          args.critic === "c-critic"
            ? args.verdict === "approve-stop"
              ? "allow-stop"
              : "absolutely-cannot-stop-now"
            : (args.verdict as "allow-stop" | "absolutely-cannot-stop-now" | "rebuttal-mode" | "rollback")

        m.governance.recordStopSignal(signal, args.critic)

        // Phase transitions based on verdict
        if (args.critic === "ts-critic") {
          if (args.verdict === "allow-stop" && m.phase.current() === "ts-pre-review") {
            m.phase.transition("implement", "ts-critic pre-review passed")
          } else if (args.verdict === "allow-stop" && m.phase.current() === "ts-post-review") {
            m.phase.transition("c-critic-final", "ts-critic post-review passed")
          } else if (["absolutely-cannot-stop-now", "rebuttal-mode", "rollback"].includes(args.verdict)) {
            if (m.phase.current() === "ts-pre-review") {
              m.phase.transition("gather", `ts-critic ${args.verdict}, need more info/plan fix`)
            } else if (m.phase.current() === "ts-post-review") {
              m.phase.transition("implement", `ts-critic ${args.verdict}, need implementation fix`)
            }
          }
        }
        if (args.critic === "c-critic") {
          if (args.verdict === "approve-stop") {
            m.phase.transition("done", "c-critic approves closeout")
          } else if (args.verdict === "reject-stop") {
            m.phase.transition("loop-back", `c-critic rejects: ${whyNotStop ?? "blockers found"}`)
          }
        }
        if (args.critic === "c-critic") {
          m.governance.recordCCriticVerdict(args.verdict === "approve-stop" ? "approve-stop" : "reject-stop")
        }

        for (const b of blockers) {
          m.governance.recordBlocker({
            source: args.critic,
            description: b.description,
            evidence: b.evidence,
            forbiddenAction: b.forbidden_action,
            unblockCondition: b.unblock_condition,
          })
        }

        m.trace.appendEvent(
          "critic.verdict",
          `${args.critic} verdict: ${args.verdict}`,
          { verdict: args.verdict, blockers, why_not_stop: whyNotStop, next_call: nextCall },
          args.critic,
        )

        return JSON.stringify(
          {
            recorded: true,
            signal,
            open_blockers: m.governance.listBlockers().map((b) => b.id),
            force_continue: m.governance.hasOpenBlockers() || signal !== "allow-stop",
          },
          null,
          2,
        )
      },
    }),
  }
}
