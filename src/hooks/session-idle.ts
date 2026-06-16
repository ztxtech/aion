/**
 * `session.idle` hook — the auto-continue decision engine.
 *
 * Fires every time the main agent goes idle. Implements the core loop logic:
 *
 *  1. Guard: if auto-continue is off or max rounds exhausted → stop.
 *  2. Interactive gate: after c-critic approve-stop in interactive mode,
 *     hold for the user's continue/stop decision (via the question tool).
 *  3. Terminal condition: phase=done OR (allow-stop + no blockers +
 *     c-critic approve-stop) → transition to done, fire completion quip.
 *  4. Otherwise: advance the round counter and inject a phase-specific
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

const PHASE_INJECTION: Record<AionPhase, string> = {
  init: `[AION PHASE: INIT]
You MUST now follow this EXACT sequence. Do NOT skip any step:
1. Call question() to ask the user about interactive vs autonomous mode, then call aion_set_interactive_mode
2. Call aion_workspace_init with the user's original task prompt
3. Call aion_memory_sync with artifact="initial-prompt"
4. Call aion_memory_sync with artifact="context-snapshot"
5. MANDATORY (serial-loop contract): dispatch ts-critic for a pre-review of the contract-extraction plan
6. MANDATORY: dispatch task(subagent_type="requirements-analyst", description="brain-storm: extract task contract, hidden goals, dual-branch plan", prompt="...") — only after the ts-critic pre-review
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
2. IMMEDIATELY call task(subagent_type="ts-critic", description="<goal>", prompt="<the returned instructions>") to ACTUALLY RUN ts-critic. The task tool blocks until ts-critic finishes.
3. After ts-critic's result comes back, call aion_critic_verdict to record its verdict.
- If ts-critic returns "absolutely-cannot-stop-now" or "rebuttal-mode": address blockers, then dispatch information-collector (or requirements-analyst for contract-level issues) as needed
- If ts-critic returns "allow-stop" for the plan: transition to implement phase (dispatch ts-critic pre-review of coder, then coder)
IMPORTANT: aion_critic_dispatch alone does NOT run the critic. You MUST follow it with a task() call in the SAME turn.`,

  implement: `[AION PHASE: IMPLEMENT]
You are at the coder step of the serial loop. You MUST:
1. (If not done yet) Dispatch ts-critic for a pre-review of the implementation plan
2. Dispatch coder via task(subagent_type="coder", description="...", prompt="...") with all context from requirements, information, and ts-critic pre-review
3. Wait for coder to report back
4. After coder reports, dispatch ts-critic for a post-review of the implementation
5. Then transition to ts-post-review phase
If coder reports blockers or needs more info, loop back to gather phase. If coder's reportback next_call=requestments-analyst or information-collector, honor it (back-edge).`,

  "ts-post-review": `[AION PHASE: TS-POST-REVIEW]
ts-critic should be reviewing coder's implementation results. Two-step flow:
1. Call aion_critic_dispatch("ts-critic", goal, artifacts) to prepare the review payload.
2. IMMEDIATELY call task(subagent_type="ts-critic", description="<goal>", prompt="<the returned instructions>") to ACTUALLY RUN ts-critic.
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
   task(subagent_type="c-critic", description="Final delivery review", prompt="You are the FINAL gate. Review the deliverables for completeness, evidence, and correctness. You MUST output approve-stop or reject-stop using aion_critic_verdict.")
2. Wait for c-critic's verdict
3. If c-critic returns "reject-stop": you MUST loop back to gather phase with the blockers c-critic identified. Dispatch requirements-analyst to rebuild the problem list.
4. If c-critic returns "approve-stop": transition to done phase for delivery.
NEVER skip this phase. c-critic has the highest authority and MUST be the final check.`,

  "loop-back": `[AION PHASE: LOOP-BACK]
A critic has rejected and identified blockers. You MUST restart the serial loop from the appropriate upstream point:
1. If the blocker is contract-level: dispatch task(subagent_type="requirements-analyst", description="Rebuild problem list with blockers", prompt="...")
2. If the blocker is evidence-level: dispatch task(subagent_type="information-collector", description="Gather missing evidence", prompt="...")
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

  return async function onSessionIdle(_input, output) {
    if (!m.config.autoContinue.enabled) {
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

    // Terminal condition: all gates passed
    if (phase === "done" || (stopSignal === "allow-stop" && !hasBlockers && cCriticVerdict === "approve-stop")) {
      m.trace.appendEvent(
        "auto-continue",
        `real stop conditions met; phase=${phase}`,
        { phase, stopSignal, hasBlockers, cCriticVerdict },
        "main-agent",
      )
      if (phase !== "done") {
        m.phase.transition("done", "all governance gates passed")
        personality?.onCompletion()
      }
      output.continue = false
      return
    }

    // Phase-aware auto-continue
    const nextRound = m.rounds.next()
    const phaseInjection = PHASE_INJECTION[phase] ?? PHASE_INJECTION.init

    const blockerList = m.governance.listBlockers().map((b) => `[${b.id}] ${b.description}`).join("\n  ")

    const reasonParts: string[] = [
      `phase=${phase}`,
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
      { nextRound, phase, reason },
      "main-agent",
    )

    const prompt = `${phaseInjection}

---
Hard gates from the aion plugin:
- Phase: ${phase}
- Open blockers: ${blockerList || "(none)"}
- Stop signal: ${stopSignal}
- ts-critic last signal: ${tsCriticSignal}
- c-critic last verdict: ${cCriticVerdict}
- Governance: c-critic > ts-critic > main agent > other subagents
- Only call aion_critic_verdict from inside ts-critic or c-critic subagent dispatches.
- To dispatch a subagent, use: task(subagent_type="<name>", description="<desc>", prompt="<prompt>")`

    output.continue = true
    output.prompt = prompt
  }
}