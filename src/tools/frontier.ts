/**
 * `aion_frontier_report` — reports one measurable frontier attempt.
 *
 * Used only after an external Goal closes while AION's completion gates
 * remain unsatisfied. The report distinguishes real metric/evidence progress
 * from renamed strategies or repeated evidence.
 */
import { tool } from "../plugin/tool"
import type { CreateToolsArgs } from "./_shared"
import type { AionToolMap } from "./types"

export function createFrontierTool(args: CreateToolsArgs): AionToolMap {
  const { managers } = args
  const m = managers
  const z = tool.schema

  const fieldArgs = {
    strategy: z.string().min(1).describe("The concrete strategy attempted this round."),
    evidence: z.string().min(1).describe("Observed artifact-level result or metric evidence."),
    value: z.number().optional().describe("Finite measured value for this attempt."),
    direction: z.enum(["maximize", "minimize"]).optional().describe("Required when value is provided."),
    gap: z.string().optional().describe("Remaining distance to the objective."),
    remainingCondition: z.string().optional().describe("What condition would make another attempt useful."),
    externalDecision: z.string().optional().describe("Required decision outside the agent's authority, if any."),
  }
  const schema = z.object(fieldArgs).superRefine((value, ctx) => {
    if (value.value !== undefined && value.direction === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["direction"],
        message: "direction=maximize|minimize is required when value is provided.",
      })
    }
  })

  return {
    aion_frontier_report: tool({
      description:
        "Report the result of one frontier attempt after a premature external Goal closure. " +
        "Provide a measurable value plus direction when possible; otherwise provide evidence that materially changed. " +
        "Set externalDecision only when a decision outside the agent's authority is required.",
      args: fieldArgs,
      schema,
      async execute(input, _context) {
        const result = m.runtimeControl.reportFrontier({
          strategy: input?.strategy ?? "",
          evidence: input?.evidence ?? "",
          value: input?.value,
          direction: input?.direction,
          gap: input?.gap,
          remainingCondition: input?.remainingCondition,
          externalDecision: input?.externalDecision,
        })
        return JSON.stringify({
          accepted: result.accepted,
          progress: result.progress,
          reason: result.reason ?? "",
          state: result.state,
        }, null, 2)
      },
    }),
  }
}
