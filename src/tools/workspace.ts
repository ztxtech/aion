/**
 * Workspace lifecycle tools: compaction and pre-stop gate.
 *
 * `aion_compaction` — rewrite context-snapshot.md from the current
 *   governance state (blockers, decisions, evidence, branch frontier) so
 *   the compacted prompt retains the most important context.
 * `aion_pre_stop_gate` — the multi-condition stop check called before
 *   transitioning to c-critic-final. Evaluates: governance hierarchy,
 *   open blockers, leakage, evidence completeness, visual-test status.
 *   Writes its verdict to completion-gate.md.
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { ensureDir, readIfExists, writeFileEnsuringDir } from "../shared/logger"
import { nowIso } from "../shared/utils"
import { notifyFromCtx } from "../shared/notify-tui"

export function createWorkspaceTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_compaction: tool({
      description:
        "Refresh the canonical context-snapshot from current real artifacts. MUST be called after: plan switch, parallel reportback merge, rebuttal state change, before pre-stop gate, before c-critic. This is a programmatic replacement for 'refresh the context-snapshot' in soft prompts.",
      args: {
        phase: z.string().default("compaction"),
        open_blockers: z.array(z.object({
          id: z.string(),
          description: z.string(),
          unblock_condition: z.string(),
        })).default([]),
        forbidden_actions: z.array(z.string()).default([]),
        next_dispatch_focus: z.string().default(""),
        structural_decisions: z.array(z.string()).default([]),
        verified_evidence: z.array(z.string()).default([]),
      },
      async execute(args, _context) {
        try {
          const path = m.workspace.snapshotPath()
          ensureDir(m.workspace.memoryDir())

          const phase = args?.phase ?? "compaction"
          const openBlockers = args?.open_blockers ?? []
          const forbiddenActions = args?.forbidden_actions ?? []
          const nextDispatchFocus = args?.next_dispatch_focus ?? ""
          const structuralDecisions = args?.structural_decisions ?? []
          const verifiedEvidence = args?.verified_evidence ?? []

          // Extract phase from next_dispatch_focus string if present (LLM pattern: "phase=gather")
          let resolvedPhase = phase
          if (resolvedPhase === "compaction" && nextDispatchFocus) {
            const phaseMatch = nextDispatchFocus.match(/phase=([a-zA-Z-]+)/i)
            if (phaseMatch) resolvedPhase = phaseMatch[1]
          }

          const blockerSection = openBlockers.length > 0
            ? `## Open Blockers\n\n${openBlockers.map((b) => `- [${b.id}] ${b.description}\n  - unblock: ${b.unblock_condition}`).join("\n")}\n`
            : `## Open Blockers\n\n- (none)\n`

          const forbiddenSection = forbiddenActions.length > 0
            ? `## Forbidden Actions\n\n${forbiddenActions.map((f) => `- ${f}`).join("\n")}\n`
            : ""

          const decisionsSection = structuralDecisions.length > 0
            ? `## Structural Decisions\n\n${structuralDecisions.map((d) => `- ${d}`).join("\n")}\n`
            : ""

          const evidenceSection = verifiedEvidence.length > 0
            ? `## Verified Evidence\n\n${verifiedEvidence.map((e) => `- ${e}`).join("\n")}\n`
            : ""

          const snapshot = `# Context Snapshot\n\n_generated: ${nowIso()} • phase: ${resolvedPhase}_\n\n${blockerSection}${forbiddenSection}${decisionsSection}${evidenceSection}## Default Next-Dispatch Focus\n\n${nextDispatchFocus || "(unset)"}\n`

          writeFileEnsuringDir(path, snapshot)
          m.trace.appendEvent(
            "compaction.finished",
            `compaction: phase=${resolvedPhase} blockers=${openBlockers.length}`,
            { phase: resolvedPhase, blockers: openBlockers.length },
            "main-agent",
          )

          return JSON.stringify({ status: "ok", path, phase: resolvedPhase, message: "compaction snapshot refreshed" }, null, 2)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          m.trace.appendEvent(
            "governance.blocker",
            `aion_compaction failed: ${msg}`,
            { error: msg, args },
            "main-agent",
          )
          return JSON.stringify({ status: "error", error: msg, hint: "Check that snapshot path is writable and all blockers have id/description/unblock_condition fields." }, null, 2)
        }
      },
    }),

    aion_pre_stop_gate: tool({
      description:
        "Programmatic pre-stop gate. Runs the full stop-condition check (brain-storm + deep-reasoning + ts-critic allow-stop + c-critic + evidence + visual) and reports whether the flow may stop. Returns a structured verdict. The auto-continue hook and c-critic both depend on this verdict.",
      args: {
        brain_storm_done: z.boolean().describe("Did brain-storm re-list remaining actions?"),
        deep_reasoning_done: z.boolean().describe("Did deep-reasoning confirm no executable path remains?"),
        ts_critic_allow_stop: z.boolean().describe("Did ts-critic explicitly output allow-stop?"),
        c_critic_verdict: z.enum(["approve-stop", "reject-stop", "unset"]).default("unset"),
        file_paths_checked: z.array(z.string()).default([]).describe("File paths cited in the final summary; each must exist on disk"),
        completion_gate_fresh: z.boolean().default(false),
        workspace_cleaned: z.boolean().default(false),
        search_coverage: z.boolean().default(false).describe("Did information-collector confirm search saturation?"),
        todo_semantics: z.boolean().default(false).describe("Are all TODO items scoped to concrete deliverables, not end/stop/done markers?"),
        report_evidence: z.boolean().default(false).describe("Does every claim in the report cite a real file path or metric on disk?"),
        figure_analysis: z.boolean().default(false).describe("If charts/plots exist, have they been visually inspected and turned into test/rollback actions?"),
        visual_test_loop: z.boolean().default(false).describe("For time-series/visual tasks, has the plot-interpret-test cycle completed?"),
      },
      async execute(args, _context) {
        const brainStormDone = args?.brain_storm_done ?? false
        const deepReasoningDone = args?.deep_reasoning_done ?? false
        const tsCriticAllowStop = args?.ts_critic_allow_stop ?? false
        const cCriticVerdict = args?.c_critic_verdict ?? "unset"
        const filePathsChecked = args?.file_paths_checked ?? []
        const completionGateFresh = args?.completion_gate_fresh ?? false
        const workspaceCleaned = args?.workspace_cleaned ?? false
        const searchCoverage = args?.search_coverage ?? false
        const todoSemantics = args?.todo_semantics ?? false
        const reportEvidence = args?.report_evidence ?? false
        const figureAnalysis = args?.figure_analysis ?? false
        const visualTestLoop = args?.visual_test_loop ?? false

        const missingPaths: string[] = []
        if (filePathsChecked.length > 0) {
          const { existsSync } = await import("node:fs")
          for (const p of filePathsChecked) {
            if (typeof p !== "string") continue
            if (!existsSync(p)) missingPaths.push(p)
          }
        }

        const blockers: string[] = []
        if (!brainStormDone) blockers.push("brain-storm pre-stop not done")
        if (!deepReasoningDone) blockers.push("deep-reasoning pre-stop not done")
        if (!tsCriticAllowStop) blockers.push("ts-critic has not output allow-stop")
        if (cCriticVerdict === "reject-stop") blockers.push("c-critic has rejected stop")
        if (cCriticVerdict === "unset") blockers.push("c-critic verdict missing")
        if (missingPaths.length > 0) blockers.push(`file paths missing on disk: ${missingPaths.join(", ")}`)
        if (!completionGateFresh) blockers.push("completion-gate not refreshed against latest state")
        if (!workspaceCleaned) blockers.push("workspace cleanup not done")
        if (!searchCoverage) blockers.push("search coverage not confirmed (information-collector saturation)")
        if (!todoSemantics) blockers.push("TODO items not scoped to concrete deliverables (end/stop/done markers forbidden)")
        if (!reportEvidence) blockers.push("report cites claims without evidence paths on disk")
        if (!figureAnalysis) blockers.push("figures/charts exist but have not been visually inspected")
        if (!visualTestLoop) blockers.push("visual test loop (plot -> interpret -> test) not completed")
        if (m.governance.hasOpenBlockers()) {
          blockers.push(
            `open governance blockers: ${m.governance.listBlockers().map((b) => b.id).join(", ")}`,
          )
        }

        const allowStop = blockers.length === 0

        if (allowStop) {
          m.governance.recordStopSignal("allow-stop", "pre-stop-gate")
          if (m.phase.current() === "ts-post-review") {
            m.phase.transition("c-critic-final", "pre-stop-gate passed, all conditions met")
          }
          notifyFromCtx(m.ctx, {
            variant: "success",
            title: "Pre-stop gate: allow-stop",
            message: "All conditions met. The flow may stop.",
            duration: 4000,
          })
        } else {
          m.governance.recordStopSignal("absolutely-cannot-stop-now", "pre-stop-gate")
          notifyFromCtx(m.ctx, {
            variant: "error",
            title: `Pre-stop gate blocked (${blockers.length} blocker${blockers.length === 1 ? "" : "s"})`,
            message:
              blockers.length > 0
                ? `${blockers.slice(0, 3).join("; ")}${blockers.length > 3 ? `; +${blockers.length - 3} more` : ""}`
                : "Stop conditions not satisfied.",
            duration: 8000,
          })
        }

        const completionGatePath = m.workspace.completionGatePath()
        ensureDir(m.workspace.memoryDir())
        const body = `# Completion Gate\n\n_generated: ${nowIso()}_\n\n## Verdict\n\n${allowStop ? "✅ allow-stop" : "❌ not allowed"}\n\n## Blockers\n\n${blockers.length === 0 ? "(none)" : blockers.map((b) => `- ${b}`).join("\n")}\n\n## Open Governance Blockers\n\n${m.governance.listBlockers().map((b) => `- [${b.id}] ${b.description}`).join("\n") || "(none)"}\n`
        writeFileEnsuringDir(completionGatePath, body)

        m.trace.appendEvent(
          "completion-gate.refreshed",
          `pre-stop-gate: ${allowStop ? "allow" : "block"} (${blockers.length} blockers)`,
          { allowStop, blockers },
          "main-agent",
        )

        return JSON.stringify({ allowStop, blockers, missingPaths, completionGatePath }, null, 2)
      },
    }),
  }
}
