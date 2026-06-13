import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { notifyFromCtx } from "../shared/notify-tui"

export function createSafetyTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_safety_gate: tool({
      description:
        "Pre-action safety gate. Call before: new external input, high-risk bash, large file edits, key writes to disk, or interpretation of web/PDF content. Returns a structured risk assessment and writes a trace event. The main flow must NOT skip this — the ts-critic review will check the trace.",
      args: {
        action: z.string().describe("Description of the action about to be taken"),
        input_source: z.string().default("user").describe("Where the input comes from: user, web, github, file, env"),
        impact_scope: z.enum(["local-read", "local-write", "remote-network", "filesystem-bulk", "exec", "git-mutation", "external-deps"]).default("local-read"),
        alternates: z.array(z.string()).default([]).describe("Safer alternate paths considered"),
      },
      async execute(args, _context) {
        const action = args?.action ?? "(unspecified action)"
        const inputSource = args?.input_source ?? "user"
        const impactScope = args?.impact_scope ?? "local-read"
        const alternates = args?.alternates ?? []

        const riskScore =
          impactScope === "exec" ? 80 :
          impactScope === "remote-network" ? 70 :
          impactScope === "git-mutation" ? 70 :
          impactScope === "filesystem-bulk" ? 60 :
          impactScope === "external-deps" ? 50 :
          impactScope === "local-write" ? 40 : 10

        const inputRisk =
          inputSource === "web" || inputSource === "github" ? 30 :
          inputSource === "env" ? 30 :
          inputSource === "file" ? 10 : 5

        const altScore = alternates.length > 0 ? -10 : 0
        const total = Math.min(100, Math.max(0, riskScore + inputRisk + altScore))

        const verdict = total >= 80 ? "block" : total >= 50 ? "warn" : "allow"

        m.trace.appendEvent(
          "file.written",
          `safety_gate: ${verdict} (score=${total}) for "${action.slice(0, 100)}"`,
          { action, source: inputSource, scope: impactScope, total, verdict },
          "main-agent",
        )

        if (verdict === "block") {
          notifyFromCtx(m.ctx, {
            variant: "error",
            title: `Safety gate: BLOCK (${total})`,
            message: `Refused action "${action.slice(0, 80)}" — score ${total} (scope=${impactScope}, source=${inputSource}). Choose a lower-impact alternate or request explicit user confirmation.`,
            duration: 8000,
          })
        } else if (verdict === "warn") {
          notifyFromCtx(m.ctx, {
            variant: "warning",
            title: `Safety gate: warn (${total})`,
            message: `Action "${action.slice(0, 80)}" is borderline (score ${total}). Proceed with care and log intent in trace.`,
            duration: 6000,
          })
        }

        return JSON.stringify(
          {
            verdict,
            score: total,
            components: { riskScore, inputRisk, altScore },
            requirements: {
              allow: "no extra action required",
              warn: "log intent in trace; continue with care",
              block: "STOP and request explicit user confirmation or choose a lower-impact alternate",
            },
          },
          null,
          2,
        )
      },
    }),

    aion_leakage_check: tool({
      description:
        "Programmatic leakage check. Tests a file path + optional content against AION's hard anti-leakage gates: credentials, hidden-set, internal prompts, memory/trace. Returns a structured verdict. Use this BEFORE reading sensitive-looking files; the tool.execute.before hook also calls this automatically.",
      args: {
        file_path: z.string(),
        content_sample: z.string().optional(),
      },
      async execute(args, _context) {
        const filePath = args?.file_path ?? ""
        const contentSample = args?.content_sample
        const result = m.enforce.leakageCheck(filePath, contentSample)
        if (!result.safe) {
          m.trace.appendEvent(
            "leakage.detected",
            `leakage block: ${result.reason} (${filePath})`,
            { filePath, reason: result.reason },
            "main-agent",
          )
          notifyFromCtx(m.ctx, {
            variant: "error",
            title: "Leakage check: UNSAFE",
            message: `${filePath || "<path-empty>"} — ${result.reason}. Refused. See trace.`,
            duration: 8000,
          })
        }
        return JSON.stringify(result, null, 2)
      },
    }),
  }
}
