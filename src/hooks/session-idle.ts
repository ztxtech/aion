/**
 * `session.idle` hook — the auto-continue decision engine.
 *
 * Fires every time the main agent goes idle. Implements the core loop logic:
 *
 *  1. Guard: if auto-continue is off or max rounds exhausted → stop.
 *  2. Interactive gate: after c-critic approve-stop in interactive mode,
 *     hold for the user's continue/stop decision (via the question tool).
 *  3. Closed external Goal audit: completed/unmet Goals require artifact
 *     review before AION accepts the closure, even from phase=done.
 *  4. Terminal condition: phase=done OR (allow-stop + no blockers +
 *     c-critic approve-stop) → transition to done, fire completion quip.
 *  5. Otherwise: advance the round counter and inject a phase-specific
 *     prompt from {@link PHASE_INJECTION} so the agent knows exactly what
 *     to do next.
 *
 * The {@link PHASE_INJECTION} table is the single source of truth for
 * per-phase mandatory steps (e.g. "init" requires brainstorm +
 * deep-reasoning + information-collection before proceeding).
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionSessionIdleHook } from "./types"
import type { AionPhase } from "../create-managers"
import { nowIso } from "../shared/utils"

const PHASE_INJECTION: Record<AionPhase, string> = {
  init: `[AION PHASE: INIT]
You MUST now follow this EXACT sequence. Do NOT skip any step:
1. Call question() to ask the user about interactive vs autonomous mode, then call aion_set_interactive_mode
2. Call aion_workspace_init with the user's original task prompt
3. Call aion_memory_sync with artifact="initial-prompt"
4. Call aion_memory_sync with artifact="context-snapshot"
5. MANDATORY (serial-loop contract): dispatch ts-critic for a pre-review of the contract-extraction plan
6. MANDATORY: dispatch subagent(agent="requirements-analyst", description="brain-storm: extract task contract, hidden goals, dual-branch plan", prompt="...") — only after the ts-critic pre-review
7. MANDATORY: dispatch ts-critic for a post-review of requirements-analyst's contract
Do NOT skip the pre- and post- ts-critic reviews. Do NOT fan out workers in parallel. The main chain is single-line: requirements-analyst → information-collector → coder, with ts-critic before and after each.`,

  gather: `[AION PHASE: GATHER]
You are mid-chain in the serial loop. Verify where you are:
- If requirements-analyst has NOT reported back done: dispatch ts-critic (pre-review if not yet), then dispatch requirements-analyst.
- If requirements-analyst is done but information-collector is NOT: dispatch ts-critic (post-review of requirements-analyst, then pre-review of information-collector), then dispatch information-collector.
- If both are done: dispatch ts-critic (post-review of information-collector), then transition to ts-pre-review.
Do NOT fan out requirements-analyst AND information-collector concurrently. The serial-loop contract requires one-at-a-time with ts-critic between them.`,

  "ts-pre-review": `[AION PHASE: TS-PRE-REVIEW]
ts-critic should be reviewing the plan before coder dispatch. Two-step flow:
1. Call aion_critic_dispatch("ts-critic", goal, artifacts) to prepare the review payload.
2. IMMEDIATELY call subagent(agent="ts-critic", description="<goal>", prompt="<the returned instructions>") to ACTUALLY RUN ts-critic. The subagent tool blocks until ts-critic finishes.
3. After ts-critic's result comes back, call aion_critic_verdict to record its verdict.
- If ts-critic returns "absolutely-cannot-stop-now" or "rebuttal-mode": address blockers, then dispatch information-collector (or requirements-analyst for contract-level issues) as needed
- If ts-critic returns "allow-stop" for the plan: transition to implement phase (dispatch ts-critic pre-review of coder, then coder)
IMPORTANT: aion_critic_dispatch alone does NOT run the critic. You MUST follow it with a task() call in the SAME turn.`,

  implement: `[AION PHASE: IMPLEMENT]
You are at the coder step of the serial loop. You MUST:
1. (If not done yet) Dispatch ts-critic for a pre-review of the implementation plan
2. Dispatch coder via subagent(agent="coder", description="...", prompt="...") with all context from requirements, information, and ts-critic pre-review
3. Wait for coder to report back
4. After coder reports, dispatch ts-critic for a post-review of the implementation
5. Then transition to ts-post-review phase
If coder reports blockers or needs more info, loop back to gather phase. If coder's reportback next_call=requestments-analyst or information-collector, honor it (back-edge).`,

  "ts-post-review": `[AION PHASE: TS-POST-REVIEW]
ts-critic should be reviewing coder's implementation results. Two-step flow:
1. Call aion_critic_dispatch("ts-critic", goal, artifacts) to prepare the review payload.
2. IMMEDIATELY call subagent(agent="ts-critic", description="<goal>", prompt="<the returned instructions>") to ACTUALLY RUN ts-critic.
3. After ts-critic's result comes back, call aion_critic_verdict to record its verdict.
- If ts-critic returns "absolutely-cannot-stop-now" or "rebuttal-mode": address blockers, re-dispatch coder (or information-collector for evidence-gap back-edges) as needed, then come back here
- If ts-critic returns "allow-stop": you are cleared to attempt closeout
- Call aion_pre_stop_gate to check all stop conditions
- If pre_stop_gate returns allowStop=true: transition to c-critic-final phase
- If pre_stop_gate has blockers: loop back to implement or gather as appropriate
IMPORTANT: aion_critic_dispatch alone does NOT run the critic. You MUST follow it with a task() call in the SAME turn.`,

  "c-critic-final": `[AION PHASE: C-CRITIC-FINAL]
This is the FINAL governance gate. c-critic has the HIGHEST authority. You MUST:
1. Dispatch c-critic under minimal context:
   subagent(agent="c-critic", description="Final delivery review", prompt="You are the FINAL gate. Review the deliverables for completeness, evidence, and correctness. You MUST output approve-stop or reject-stop using aion_critic_verdict.")
2. Wait for c-critic's verdict
3. If c-critic returns "reject-stop": you MUST loop back to gather phase with the blockers c-critic identified. Dispatch requirements-analyst to rebuild the problem list.
4. If c-critic returns "approve-stop": transition to done phase for delivery.
NEVER skip this phase. c-critic has the highest authority and MUST be the final check.`,

  "loop-back": `[AION PHASE: LOOP-BACK]
A critic has rejected and identified blockers. You MUST restart the serial loop from the appropriate upstream point:
1. If the blocker is contract-level: dispatch subagent(agent="requirements-analyst", description="Rebuild problem list with blockers", prompt="...")
2. If the blocker is evidence-level: dispatch subagent(agent="information-collector", description="Gather missing evidence", prompt="...")
3. After the upstream worker reports back, go through ts-pre-review → implement → ts-post-review → c-critic-final again
This is a MANDATORY loop, not an optional step. Do not shortcut. Do not fan out workers — restart the serial chain one step at a time.`,

  done: `[AION PHASE: DONE]
c-critic has authorized the final delivery. All governance gates have passed. You MUST:
1. Write a summary of what was accomplished
2. Call aion_memory_sync to update progress and completion-gate
3. Verify all cited file paths exist on disk using aion_safety_gate or bash ls
4. Clean up any temporary or unnecessary files
5. Present the final result to the user
This phase is for delivery only — no new work.`,
}

export function createSessionIdleHook(args: CreateHooksArgs): AionSessionIdleHook {
  const { managers, personality } = args
  const m = managers

  return async function onSessionIdle(input, output) {
    m.runtimeControl.activateSession(input.sessionID)
    const task = m.runtimeControl.taskState()
    let audit = `Round self-audit required: phase=${m.phase.current()}, open blockers=${m.governance.hasOpenBlockers() ? "yes" : "no"}, external goal=${task.externalGoalStatus}.`

    if (input.eventID && task.lastContinuationEventID === input.eventID) {
      output.continue = false
      return
    }

    if (!m.config.autoContinue.enabled) {
      m.runtimeControl.checkpoint({
        status: task.externalGoalStatus === "active" ? "active" : "awaiting-review",
        lastAuditAt: nowIso(),
        lastAudit: audit,
      })
      output.continue = false
      return
    }
    if (m.rounds.remaining() <= 0) {
      m.trace.appendEvent(
        "auto-continue",
        `max rounds reached (${m.state.rounds.max}); stopping`,
        { rounds: m.state.rounds.current, max: m.state.rounds.max },
        "main-agent",
      )
      m.runtimeControl.checkpoint({
        status: "blocked",
        lastAuditAt: nowIso(),
        lastAudit: `${audit} Max AION rounds reached; manual review required.`,
      })
      output.continue = false
      return
    }

    if (m.runtimeControl.resumeContext().interrupted) {
      m.runtimeControl.checkpoint({
        status: "awaiting-review",
        lastAuditAt: nowIso(),
        lastAudit: `${audit} Session was interrupted; do not auto-continue until user progress resumes it.`,
      })
      output.continue = false
      return
    }

    const stopSignal = m.state.governance.stopSignal
    const cCriticVerdict = m.state.governance.lastCCriticVerdict
    const tsCriticSignal = m.state.governance.lastTsCriticSignal
    const hasBlockers = m.governance.hasOpenBlockers()
    const phase = m.phase.current()
    const userDecision = m.state.governance.userContinueDecision
    const isInteractive = m.interactiveMode.isInteractive()

    // === Interactive mode gate: after c-critic approve-stop, require user confirmation ===
    if (isInteractive && cCriticVerdict === "approve-stop" && phase !== "done") {
      if (userDecision === "unset") {
        // User has not yet answered. Hold the loop; main agent must call 'question' tool.
        m.trace.appendEvent(
          "auto-continue",
          `interactive mode: holding for user continue decision (c-critic approved)`,
          { phase, cCriticVerdict, userDecision },
          "main-agent",
        )
        m.runtimeControl.checkpoint({
          status: "awaiting-review",
          lastAuditAt: nowIso(),
          lastAudit: `${audit} Waiting for the user's continue/stop decision.`,
        })
        output.continue = false
        return
      }
      if (userDecision === "stop") {
        m.trace.appendEvent(
          "auto-continue",
          `interactive mode: user chose STOP. Finalizing.`,
          { phase, cCriticVerdict, userDecision, userComment: m.state.governance.userComment },
          "user",
        )
        m.phase.transition("done", "user chose to stop in interactive mode")
        personality?.onCompletion()
        m.runtimeControl.checkpoint({
          status: "completed",
          lastAuditAt: nowIso(),
          lastAudit: `${audit} User explicitly chose to stop.`,
        })
        output.continue = false
        return
      }
      if (userDecision === "continue") {
        // User wants another round. Reset verdict so loop continues normally.
        m.trace.appendEvent(
          "auto-continue",
          `interactive mode: user chose CONTINUE. Resetting c-critic verdict and re-entering loop.`,
          { phase, cCriticVerdict, userDecision, userComment: m.state.governance.userComment },
          "user",
        )
        m.governance.recordCCriticVerdict("unset")
        m.userContinue.reset()
        // Re-enter loop at loop-back phase to absorb user feedback
        m.phase.transition("loop-back", "user requested another round in interactive mode")
        // Fall through to the normal continue path below
      }
    }

    if (task.externalGoalStatus === "active") {
      m.runtimeControl.checkpoint({
        status: "active",
        lastAuditAt: nowIso(),
        lastAudit: `${audit} Goal plugin owns the next continuation; AION state is checkpointed.`,
      })
      output.continue = false
      return
    }

    if (["paused", "cancelled", "budgetLimited", "usageLimited"].includes(task.externalGoalStatus)) {
      m.runtimeControl.checkpoint({
        status: "awaiting-review",
        lastAuditAt: nowIso(),
        lastAudit: `${audit} External goal is explicitly stopped or limited; AION will not override it.`,
      })
      output.continue = false
      return
    }

    const goalCorrection = task.externalGoalStatus === "completed" || task.externalGoalStatus === "unmet"
    let currentPhase = m.phase.current()
    if (goalCorrection && currentPhase === "done") {
      m.phase.transition("loop-back", `external Goal closed as ${task.externalGoalStatus} before AION completion gates passed`)
      currentPhase = "loop-back"
      audit = `Round self-audit required: phase=${currentPhase}, open blockers=${m.governance.hasOpenBlockers() ? "yes" : "no"}, external goal=${task.externalGoalStatus}.`
    }

    // Terminal condition: all gates passed
    const aionComplete = currentPhase === "done" ||
      (stopSignal === "allow-stop" && !hasBlockers && cCriticVerdict === "approve-stop")
    if (aionComplete) {
      m.trace.appendEvent(
        "auto-continue",
        `real stop conditions met; phase=${currentPhase}`,
        { phase: currentPhase, stopSignal, hasBlockers, cCriticVerdict },
        "main-agent",
      )
      if (currentPhase !== "done") {
        m.phase.transition("done", "all governance gates passed")
        personality?.onCompletion()
      }
      m.runtimeControl.checkpoint({
        status: "completed",
        lastAuditAt: nowIso(),
        lastAudit: `${audit} Governance terminal conditions are satisfied.`,
      })
      output.continue = false
      return
    }

    // Phase-aware auto-continue
    const nextRound = m.rounds.next()
    const phaseInjection = PHASE_INJECTION[currentPhase] ?? PHASE_INJECTION.init

    const blockerList = m.governance.listBlockers().map((b) => `[${b.id}] ${b.description}`).join("\n  ")

    const reasonParts: string[] = [
      `phase=${currentPhase}`,
      `round=${nextRound}/${m.state.rounds.max}`,
    ]
    if (hasBlockers) reasonParts.push(`open blockers: ${blockerList || "(none)"}`)
    if (stopSignal !== "allow-stop") reasonParts.push(`stop signal: ${stopSignal}`)
    if (tsCriticSignal !== "allow-stop") reasonParts.push(`ts-critic: ${tsCriticSignal}`)
    if (cCriticVerdict !== "approve-stop") reasonParts.push(`c-critic: ${cCriticVerdict}`)

    const reason = reasonParts.join("; ")

    m.trace.appendEvent(
      "auto-continue",
      `continuing to round ${nextRound}: ${reason}`,
      { nextRound, phase: currentPhase, reason },
      "main-agent",
    )

    const prompt = `${goalCorrection ? "[AION EXTERNAL GOAL CLOSE AUDIT]" : "[AION TASK KEEPER ROUND AUDIT]"}
Before taking action, audit the previous turn against the objective and real artifacts:
1. Re-read task.md, .opencode/memory/todo-map.md, progress.md, and completion-gate.md.
2. Identify exactly one highest-value unfinished action with file-level evidence.
3. Do not mark the goal complete or unmet merely because a turn ended, a gate blocked, or an approach failed.
4. If the objective is genuinely unattainable, record a concrete blocker and request the smallest external decision instead of silently closing.
5. Continue the AION phase loop below. Do not end with prose only.
${goalCorrection ? `6. The external Goal was closed as ${task.externalGoalStatus}, but AION completion gates are not satisfied. Audit that closure against the artifacts before accepting it.` : ""}

${phaseInjection}

---
Hard gates from the aion plugin:
- Phase: ${currentPhase}
- Open blockers: ${blockerList || "(none)"}
- Stop signal: ${stopSignal}
- ts-critic last signal: ${tsCriticSignal}
- c-critic last verdict: ${cCriticVerdict}
- Governance: c-critic > ts-critic > main agent > other subagents
- Only call aion_critic_verdict from inside ts-critic or c-critic subagent dispatches.
- To dispatch a subagent, use: subagent(agent="<name>", description="<desc>", prompt="<prompt>")`

    m.runtimeControl.checkpoint({
      status: "active",
      lastAuditAt: nowIso(),
      lastAudit: audit,
      goalCorrectionCount: task.goalCorrectionCount + (goalCorrection ? 1 : 0),
    })
    output.continue = true
    output.prompt = prompt
  }
}
