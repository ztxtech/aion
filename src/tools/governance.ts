/**
 * Governance tools: blocker registry.
 *
 * `aion_record_blocker` — register a blocker raised by a critic or analysis
 *   agent. Open blockers prevent the auto-continue loop from stopping and
 *   appear in the next dispatch's `unresolved_blockers` slot.
 * `aion_resolve_blocker` — mark a blocker as fixed with evidence. The fix
 *   evidence is traced for ts-critic audit.
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"

export function createGovernanceTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_record_blocker: tool({
      description:
        "Record a new governance blocker. Use when an upstream critic or analysis agent has identified a real blocker. Programmatic — every recorded blocker appears in the next dispatch's `unresolved_blockers` slot and prevents the auto-continue loop from stopping.",
      args: {
        source: z.enum([
          "ts-critic",
          "c-critic",
          "main-agent",
          "information-collector",
          "requirements-analyst",
          "coder",
        ]),
        description: z.string(),
        evidence: z.string(),
        forbidden_action: z.string(),
        unblock_condition: z.string(),
      },
      async execute(args, _context) {
        const description = args?.description ?? ""
        const evidence = args?.evidence ?? ""
        const forbiddenAction = args?.forbidden_action ?? ""
        const unblockCondition = args?.unblock_condition ?? ""
        const blocker = m.governance.recordBlocker({
          source: args.source,
          description,
          evidence,
          forbiddenAction,
          unblockCondition,
        })
        return JSON.stringify({ recorded: blocker }, null, 2)
      },
    }),

    aion_resolve_blocker: tool({
      description: "Resolve an existing governance blocker. The blocker must have a real fix attached; ts-critic will check the trace.",
      args: {
        blocker_id: z.string(),
        fix_evidence: z.string().describe("What changed to satisfy the unblock condition"),
      },
      async execute(args, _context) {
        const fixEvidence = args?.fix_evidence ?? ""
        const ok = m.governance.resolveBlocker(args.blocker_id)
        if (!ok) {
          return JSON.stringify({ resolved: false, reason: `blocker ${args.blocker_id} not found` }, null, 2)
        }
        m.trace.appendEvent(
          "governance.blocker",
          `blocker ${args.blocker_id} resolved with: ${fixEvidence.slice(0, 200)}`,
          { blockerId: args.blocker_id, evidence: fixEvidence },
          "main-agent",
        )
        return JSON.stringify({ resolved: true, remaining: m.governance.listBlockers().map((b) => b.id) }, null, 2)
      },
    }),
  }
}
