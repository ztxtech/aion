/**
 * `experimental.chat.system.transform` hook — the system-prompt injection engine.
 *
 * Runs on every chat turn and mutates the system prompt to inject live,
 * phase-aware governance context. This is where the bulk of AION's
 * behavioural steering happens:
 *   - Banner + environment discovery (agents, MCP servers, skills present)
 *   - Shared-cache protocol + debug-prefix rule
 *   - No-stop rule + anti-stop-contamination rule
 *   - Interactive-mode handling
 *   - Phase-specific hints (from {@link PHASE_SYSTEM_HINTS})
 *   - Rebuttal / blind-optimism / visual-semantic injections
 *   - TODO-map-driven plan reminders + budget warnings
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionSystemTransformHook, AionIntent } from "./types"
import type { AionPhase } from "../create-managers"
import { getFullSystemInjection } from "./intent"
import { info } from "../shared/logger"
import { readIfExists } from "../shared/logger"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { AION_SKILLS, TS_BOUND_SKILLS } from "../prompts/skill-registry"
import { resetWorkerProgress } from "../scheduling/state-machine"
import { COMPLEXITY_CLASSIFIER_PROMPT } from "../scheduling/complexity"
import { MAX_EVIDENCE_PROMPT } from "../shared/runtime-control"

const PHASE_SYSTEM_HINTS: Record<AionPhase, string> = {
  init: `[AION PHASE HINT: INIT] You are in the initialization phase. Your MANDATORY first actions, in this exact order:
1. Call question() to ask the user about interactive vs autonomous mode, then call aion_set_interactive_mode
2. Call aion_workspace_init
3. Call aion_memory_sync artifact="initial-prompt"
4. Call aion_memory_sync artifact="context-snapshot"
5. Dispatch ts-critic for a pre-review of the contract-extraction plan (serial-loop contract: ts-critic reviews BEFORE every worker)
6. Dispatch requirements-analyst with the pre-review context
7. After requirements-analyst reports back, dispatch ts-critic for a post-review
Do NOT fan out workers. The main chain is single-line.`,
  gather: `[AION PHASE HINT: GATHER] You are mid-chain. Verify which worker is next in the serial order (requirements-analyst → information-collector → coder). Each worker MUST be sandwiched between ts-critic pre-review and post-review. Do NOT fan out multiple workers in parallel.`,
  "ts-pre-review": `[AION PHASE HINT: TS-PRE-REVIEW] ts-critic should review the plan before coder dispatch. Two-step: (1) aion_critic_dispatch("ts-critic", goal, artifacts) to prepare payload; (2) IMMEDIATELY task(subagent_type="ts-critic", description, prompt=<returned instructions>) to ACTUALLY RUN it. The task tool blocks until ts-critic finishes. Do NOT end your turn between step 1 and 2.`,
  implement: `[AION PHASE HINT: IMPLEMENT] Dispatch ts-critic for a pre-review of coder's plan (if not done yet): aion_critic_dispatch then IMMEDIATELY task(subagent_type="ts-critic"). Then dispatch coder via task(subagent_type="coder"). After coder reports back, dispatch ts-critic for post-review (same two-step). Do not skip either review.`,
  "ts-post-review": `[AION PHASE HINT: TS-POST-REVIEW] ts-critic should review coder's implementation. Two-step: (1) aion_critic_dispatch("ts-critic", goal, artifacts) to prepare payload; (2) IMMEDIATELY task(subagent_type="ts-critic", ...) to ACTUALLY RUN it. Then call aion_critic_verdict. Address any blockers before attempting closeout.`,
  "c-critic-final": `[AION PHASE HINT: C-CRITIC-FINAL] This is the final governance gate. You MUST dispatch c-critic for a minimal-context cold-start review. If not dispatched, do it now: task(subagent_type="c-critic", description="Final closeout review", prompt="...")`,
  "loop-back": `[AION PHASE HINT: LOOP-BACK] Closeout was rejected. Restart the serial chain from the appropriate upstream point: requirements-analyst for contract-level blockers, information-collector for evidence-level blockers. Do NOT fan out — one worker at a time.`,
  done: `[AION PHASE HINT: DONE] Task complete. ALL governance gates have passed. You may now write a final summary and present results to the user. You do NOT need to call any more tools — the loop will stop.`,
}

const PHASE_BUDGET: Record<AionPhase, { recommended: number; warning: string }> = {
  init: { recommended: 2, warning: "Init should complete in 1-2 rounds. If still here, call aion_workspace_init immediately." },
  gather: { recommended: 6, warning: "Gathering is taking too long. Consider dispatching with tighter scope or moving to ts-pre-review." },
  "ts-pre-review": { recommended: 4, warning: "ts-pre-review is taking too long. Either ts-critic is dispatched (wait) or dispatch it now." },
  implement: { recommended: 10, warning: "Implementation is taking many rounds. Consider breaking into smaller steps via aion_todo_update." },
  "ts-post-review": { recommended: 4, warning: "ts-post-review stalling. Either get ts-critic verdict or address blockers." },
  "c-critic-final": { recommended: 3, warning: "c-critic-final taking too long. Dispatch c-critic immediately." },
  "loop-back": { recommended: 2, warning: "Loop-back should quickly re-enter gather. Dispatch requirements-analyst now." },
  done: { recommended: 2, warning: "Done phase should wrap up quickly." },
}

const CORE_PROTOCOL_PROMPT = `[AION CORE PROTOCOL]
Memory: .opencode/memory is the shared cache for all agents except c-critic; read progress, decisions, and negative memory before dispatch and write only through aion_memory_sync. trace.md is append-only. c-critic uses minimal context and may not treat memory as source-of-truth.
Format: every response starts with [Agent: <name>] Follow: <real active gates>; Current step: <one line>. No deprecated round-count phrases.
Loop: do not end a turn with only prose; advance state through an AION tool. Stop only when phase=done, c-critic emits approve-stop, pre-stop allows it, and no blocker remains.
Stop authority: only ts-critic and c-critic may decide stop. TODOs, dispatches, and non-critic wording must use the next concrete action, never stop/finish/task-complete. If stalled, review the todo map and open a useful branch.`

const SCHEDULING_CHAIN = "init -> gather -> ts-pre-review -> implement -> ts-post-review -> c-critic-final -> done; worker next_call may request a bounded backedge; c-critic rejection returns to the requested upstream gate. tool-guard enforces all edges."

const LANGUAGE_EFFECT: Record<string, string> = {
  en: "Use English for reasoning, interaction, and delivery.",
  "zh-reason-en-deliver": "Use Chinese reasoning/interaction; keep code, APIs, identifiers, and artifacts English.",
  "zh-deliver": "Use Chinese for delivery and interaction.",
  bilingual: "Deliver in both Chinese and English.",
}

const ENVIRONMENT_CACHE = new Map<string, { fingerprint: string; prompt: string | null }>()

function fingerprintEnvironment(directory: string): string {
  const watched = [
    join(directory, ".opencode", "agents"),
    join(directory, "opencode.json"),
    join(directory, ".opencode", "aion.jsonc"),
    join(directory, ".opencode", "plugins"),
    join(directory, ".opencode", "skills"),
  ]

  return watched.map((path) => {
    try {
      const stats = statSync(path)
      return `${path}:${stats.ino}:${stats.size}:${stats.mtimeMs}`
    } catch {
      return `${path}:missing`
    }
  }).join("|")
}

function readOpencodeConfig(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null
  try {
    const stripped = readFileSync(path, "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
    const parsed = JSON.parse(stripped)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

const AION_BANNER = "[AION] Time-series multi-agent orchestration with governance gates and anti-leakage. Agents: requirements-analyst, information-collector, coder, ts-critic, c-critic. Authority: c-critic > ts-critic > main agent > workers."

function discoverEnvironment(directory: string): string | null {
  const fingerprint = fingerprintEnvironment(directory)
  const cached = ENVIRONMENT_CACHE.get(directory)
  if (cached && cached.fingerprint === fingerprint) return cached.prompt

  const sections: string[] = []

  // 1. Discover agent definitions
  const agents: string[] = ["aion", "requirements-analyst", "information-collector", "coder", "ts-critic", "c-critic"]
  const agentsDir = join(directory, ".opencode", "agents")
  if (existsSync(agentsDir)) {
    try {
      const files = readdirSync(agentsDir)
      for (const f of files) {
        if (f.endsWith(".md") || f.endsWith(".markdown")) {
          const name = f.replace(/\.(md|markdown)$/, "")
          if (!agents.includes(name)) agents.push(name)
        }
      }
    } catch {
      // ignore
    }
  }

  // Parse opencode.json for additional agent names
  const ocJsonPath = join(directory, "opencode.json")
  const opencodeConfig = readOpencodeConfig(ocJsonPath)
  if (opencodeConfig?.agent && !Array.isArray(opencodeConfig.agent)) {
    for (const name of Object.keys(opencodeConfig.agent as Record<string, unknown>)) {
      if (!agents.includes(name)) agents.push(name)
    }
  }

  // 2. Plugins
  const aionPlugins: string[] = []
  const aionJsoncPath = join(directory, ".opencode", "aion.jsonc")
  if (existsSync(aionJsoncPath)) aionPlugins.push("aion")
  const pluginsDir = join(directory, ".opencode", "plugins")
  if (existsSync(pluginsDir)) {
    try {
      const files = readdirSync(pluginsDir)
      for (const f of files) {
        if (f === "aion" && statSync(join(pluginsDir, f)).isDirectory()) {
          if (!aionPlugins.includes("aion")) aionPlugins.push("aion")
          continue
        }
        if (f.endsWith(".js") || f.endsWith(".mjs")) {
          const name = f.replace(/\.(js|mjs)$/, "")
          if (!aionPlugins.includes(name)) aionPlugins.push(name)
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. MCP servers
  const mcpServers: string[] = []
  if (opencodeConfig?.mcp_servers && !Array.isArray(opencodeConfig.mcp_servers)) {
    for (const name of Object.keys(opencodeConfig.mcp_servers as Record<string, unknown>)) {
      mcpServers.push(name)
    }
  }

  // Local skills are enough here. OpenCode already resolves global skills and
  // scanning HOME on every project would add IO and duplicate prompt text.
  const skills: string[] = []
  const skillsDir = join(directory, ".opencode", "skills")
  if (existsSync(skillsDir)) {
    try {
      const entries = readdirSync(skillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          skills.push(entry.name)
        } else if (entry.name.endsWith(".md")) {
          skills.push(entry.name.replace(/\.md$/, ""))
        }
      }
    } catch {
      // ignore
    }
  }

  // Build basic environment section
  if (agents.length > 0) {
    sections.push(`Agents: ${agents.join(", ")}`)
  }
  if (mcpServers.length > 0) {
    sections.push(`MCP servers: ${mcpServers.join(", ")}`)
  }
  if (aionPlugins.length > 0) {
    sections.push(`Plugins: ${aionPlugins.join(", ")}`)
  }
  if (skills.length > 0) {
    sections.push(`Skills (directories): ${skills.join(", ")}`)
  }

  sections.push(`AION skills: ${AION_SKILLS.filter((s) => s.name !== "template").map((s) => s.name).join(", ")}`)
  sections.push(`Time-series-bound skills: ${TS_BOUND_SKILLS.join(", ")}`)

  const prompt = `[AION ENVIRONMENT - OpenCode session]\n${sections.join("\n")}\nUse these resources through native tools. Tell subagents which skills apply and let them call skill() on demand; do not paste skill content into dispatch prompts.`
  ENVIRONMENT_CACHE.set(directory, { fingerprint, prompt })
  return prompt
}

export function createSystemTransformHook(args: CreateHooksArgs): AionSystemTransformHook {
  const { ctx, managers } = args
  let bannerShown = false
  const todoCache: { fingerprint: string | null; injection: string | null } = {
    fingerprint: null,
    injection: null,
  }

  return async function onSystemTransform(input, output) {
    const { sessionID, model } = input
    const intent: AionIntent = (managers.state._lastIntent as AionIntent) ?? "general"
    const modelId = model?.id ?? "unknown"
    const round = managers.state.rounds.current
    managers.runtimeControl.refresh()
    managers.runtimeControl.activateSession(sessionID)
    const phase: AionPhase = managers.phase.current()
    const executionMode = managers.runtimeControl.current()
    const resumeContext = managers.runtimeControl.resumeContext()

    // Inject banner on first turn
    if (!bannerShown) {
      const banner = `${AION_BANNER}\n\nModel: ${modelId}\nPhase: ${phase}\nRound: ${round}`
      output.system.push(banner)
      bannerShown = true
    }

    const injections: string[] = []

    // Stable context comes first so provider prompt caches see a stable prefix.
    const envInfo = discoverEnvironment(ctx.directory)
    if (envInfo) {
      injections.push(envInfo)
    }
    injections.push(CORE_PROTOCOL_PROMPT)

    injections.push(...getFullSystemInjection(
      ctx.directory,
      intent,
      sessionID,
    )
    )

    // === Complexity classifier prompt (injected once at round 1) ===
    // Per devnotes/proposals/2026-07-08-dynamic-complexity-scheduler.md,
    // the main agent must classify the task on the first non-trivial
    // turn via aion_set_complexity. We inject the prompt once so the
    // LLM sees the criteria before it has a chance to dispatch anything.
    // After aion_set_complexity has been called, this injection is
    // suppressed (the LLM already knows the tier).
    if (executionMode !== "AUTO") {
      injections.push(
        `[AION RUNTIME MODE] User locked execution to ${executionMode}. ` +
          `Do not call aion_set_complexity. Use ${managers.runtimeControl.effectiveTier()} dispatch rules.`,
      )
    } else if (!managers.complexity.isSet()) {
      injections.push(COMPLEXITY_CLASSIFIER_PROMPT)
    }

    if (executionMode === "MAX") {
      injections.push(MAX_EVIDENCE_PROMPT)
    }

    const shouldInjectResume =
      resumeContext.lastPhase !== null &&
      resumeContext.lastPhase !== "done" &&
      resumeContext.interrupted
    if (shouldInjectResume) {
      injections.push(
        `[AION RESUME PROTOCOL] A previous session stopped at ${resumeContext.lastPhase}. ` +
          "Before any new dispatch, read .opencode/memory/todo-map.md, progress.md, decisions.md, and context-snapshot.md. " +
          "Confirm which plan items are actually complete, then continue from the first incomplete item. " +
          (resumeContext.resumeHint ?? "Do not restart completed work."),
      )
    }

    // === Language: session-start question OR config-default fallback ===
    // The LLM is supposed to ask the user via the 'question' tool on round 1.
    // The user's answer triggers aion_set_language, which resolves the state
    // with source="session-start". If the LLM never asks (skipped the
    // directive, or this isn't round 1 anymore), we fall back to the config
    // default so the loop can keep moving.
    if (managers.state.governance.languageResolved === "unset") {
      if (round <= 1) {
        // Round 1: inject the MANDATORY ask directive. Do NOT resolve yet —
        // wait for the LLM to actually call aion_set_language. The
        // "if unavailable" clause guards against headless modes
        // (`--dangerously-skip-permissions`, agent contexts where the question
        // tool is filtered out) where the LLM would otherwise loop on the
        // "unavailable tool" error. The graceful-degrade path was observed
        // to work in the 2026-07-08 unit-test run; the prompt now codifies it
        // so it doesn't depend on the LLM noticing and recovering by itself.
        injections.push(
          `[AION LANGUAGE — ASK THE USER NOW (MANDATORY)]
You MUST use OpenCode's 'question' tool on your FIRST turn to ask the user which language they want for interaction and delivery. Offer these options:
  - "English everywhere"  (mode: en)
  - "Chinese reasoning + English delivery"  (mode: zh-reason-en-deliver)
  - "Chinese delivery throughout"  (mode: zh-deliver)
  - "Bilingual (Chinese + English)"  (mode: bilingual)
After the user answers, call aion_set_language(mode=<choice>) to lock it in.
Do NOT proceed with the task until you have asked this question.

GRACEFUL DEGRADE: if the 'question' tool is unavailable in this environment (e.g. when running headlessly with --dangerously-skip-permissions), skip the user prompt entirely and immediately call aion_set_language(mode="en") to use the English default. Do not retry the question tool — it will keep failing.`,
        )
      } else {
        // Round > 1 and still unset: LLM skipped the question. Fall back.
        const langMode = managers.config.language?.mode ?? "en"
        managers.language.resolve(langMode, "config-default")
      }
    }

    // === Language: inject directive every turn ===
    const langMode = managers.language.getMode()
    const langDirective = `[AION LANGUAGE] ${LANGUAGE_EFFECT[langMode] ?? LANGUAGE_EFFECT.en}`
    injections.push(langDirective)

    // === Interactive mode: session-start MANDATORY question ===
    // On the FIRST turn of every session, the LLM MUST ask the user whether they
    // want interactive mode (loop pauses for the user between rounds) or fully
    // autonomous mode. This binding is fixed for the rest of the session unless
    // the user explicitly says otherwise.
    //
    // Same protocol as language: round 1 = inject ask directive, do NOT resolve.
    // Round > 1 still unset = LLM skipped, fall back to config.
    if (managers.state.governance.interactiveModeResolved === "unset") {
      if (round <= 1) {
        injections.push(
          `[AION INTERACTIVE MODE — ASK THE USER NOW (MANDATORY)]
You MUST use OpenCode's 'question' tool on your FIRST turn to ask the user how they want to interact with the loop. Offer these options:
  - "Autonomous — run to completion"  (granularity: autonomous)
  - "Round-checkpoint — pause after c-critic verdicts"  (granularity: round-checkpoint)
  - "Always-interactive — pause at every major decision"  (granularity: always-interactive)
After the user answers, call aion_set_interactive_mode(granularity=<choice>) to lock it in.
Do NOT proceed with the task until you have asked BOTH this question AND the language question.

GRACEFUL DEGRADE: if the 'question' tool is unavailable (e.g. --dangerously-skip-permissions headless run), skip the user prompt entirely and immediately call aion_set_interactive_mode(enabled=false, granularity="autonomous") to use the autonomous default. Do not retry the question tool — it will keep failing.`,
        )
      } else {
        // Round > 1 and still unset: LLM skipped. Fall back to config default.
        const configDefault = managers.config.interactiveMode.enabled
        const configGranularity = managers.config.interactiveMode.granularity ?? (configDefault ? "round-checkpoint" : "autonomous")
        managers.interactiveMode.resolve(
          configDefault ? "interactive" : "autonomous",
          "config-default",
          { granularity: configGranularity, customTriggers: managers.config.interactiveMode.customTriggers ?? [] },
        )
        if (!configDefault) {
          injections.push(
            `[AION INTERACTIVE MODE — AUTO-RESOLVED (LLM skipped the question)]
Session mode has been set to FULLY AUTONOMOUS based on config (interactiveMode.enabled=false).
The loop will run to completion without asking between rounds.
The user can switch to interactive at any time by saying "switch to interactive" or "ask me between rounds".`,
          )
        } else {
          const effectMap: Record<string, string> = {
            "round-checkpoint": "After c-critic approves closeout, the loop will pause and ask the user whether to continue.",
            "always-interactive": "The loop will pause at every major decision (dispatch, critic verdict, plan switch, phase transition) to ask the user.",
            "custom": `The loop will pause at these custom triggers: ${(managers.config.interactiveMode.customTriggers ?? []).join(", ") || "(none)"}`,
            "autonomous": "The loop runs fully auto.",
          }
          injections.push(
            `[AION INTERACTIVE MODE — AUTO-RESOLVED (LLM skipped the question)]
Session mode has been set to INTERACTIVE (granularity: ${configGranularity}) based on config.
${effectMap[configGranularity] ?? effectMap["round-checkpoint"]}
The user can switch to autonomous at any time by saying "switch to autonomous" or "I'm leaving".

If you are uncertain about a decision mid-loop, you MAY use the 'question' tool to ask the user.
Do NOT ask the user about mode — it is already resolved from config.`,
          )
        }
      }
    }

    // === Interactive mode: per-round user check (only if user picked interactive) ===
    const cCriticApproved = managers.state.governance.lastCCriticVerdict === "approve-stop"
    const userDecision = managers.state.governance.userContinueDecision
    if (managers.interactiveMode.isInteractive() && cCriticApproved) {
      if (userDecision === "unset") {
        injections.push(
          `[AION INTERACTIVE MODE — USER CHECK REQUIRED]
c-critic has approved closeout. You MUST pause and gather the user's preference BEFORE finalizing. Use OpenCode's built-in 'question' tool to ask:

  question(questions=[{
    question: "c-critic has approved closeout. How should the loop continue?",
    header: "Continue or stop?",
    options: [
      { label: "Continue another round", description: "Reject closeout, re-enter loop, have agents refine more" },
      { label: "Stop and finalize", description: "Approve closeout, end the loop, deliver final results" }
    ]
  }])

After the user answers, call aion_set_interactive_mode first to record the mode, then call aion_user_check via todo-map decision (or directly record the continue/stop decision through aion_todo_update commentary). For simple cases, just call aion_set_interactive_mode(enabled=false) to finalize, or call aion_todo_update(action="update-state") with the user's comment folded in to re-enter the loop.`,
        )
      } else if (userDecision === "continue") {
        injections.push(
          `[AION INTERACTIVE MODE — USER CONTINUED]
The user chose 'continue'${managers.state.governance.userComment ? ` with comment: "${managers.state.governance.userComment}"` : " with no comment"}.
The c-critic verdict has been reset and the loop will re-enter. You SHOULD:
1. Read the user comment carefully — it is feedback/direction for the next round.
2. Call aion_todo_update(action="add-from-reportback", reportback_text="<user comment>", reportback_source="user") to fold the comment into the plan.
3. Dispatch subagents again with the updated focus.`,
        )
      } else if (userDecision === "stop") {
        injections.push(
          `[AION INTERACTIVE MODE — USER STOPPED]
The user chose 'stop'. You MUST now finalize:
1. Write a final summary of what was accomplished.
2. Update progress and completion-gate.
3. Present the final result to the user.`,
        )
      }
    }

    // === TODO map as driving plan ===
    const todoPath = managers.workspace.todoMapPath()
    let nextTodoFingerprint: string
    try {
      const stats = statSync(todoPath)
      nextTodoFingerprint = `${stats.ino}:${stats.size}:${stats.mtimeMs}`
    } catch {
      nextTodoFingerprint = "missing"
    }
    if (nextTodoFingerprint !== todoCache.fingerprint) {
      const todoContent = readIfExists(todoPath)
      if (todoContent && todoContent.length > 50) {
        const summaryLines = todoContent.split("\n").filter((line) =>
          /^[-*]\s*(Total|Done|In-progress|Todo):/.test(line) || /^####\s*TODO-/.test(line),
        )
        todoCache.injection = summaryLines.length > 0
          ? `[AION TODO MAP]\n${summaryLines.join("\n")}`
          : null
      } else {
        todoCache.injection = "[AION TODO MAP] No plan exists yet. Create major steps with aion_todo_update(action=\"add\") after requirements-analyst reports."
      }
      todoCache.fingerprint = nextTodoFingerprint
    }
    if (todoCache.injection) injections.push(todoCache.injection)

    const phaseHint = PHASE_SYSTEM_HINTS[phase]
    if (phaseHint) {
      injections.push(phaseHint)
    }

    // The compact chain is enough for planning; tool-guard still enforces edges.
    if (phase !== "done") {
      injections.push(`[AION SCHEDULING] ${SCHEDULING_CHAIN}`)
    }

    // === Reset worker progress on loop-back ===
    // When c-critic rejects and we re-enter gathering, the worker state
    // machine needs to forget that requirements-analyst / information-collector
    // have "already run" — they need to be allowed to re-run with new focus.
    if (phase === "loop-back" || phase === "init") {
      resetWorkerProgress()
    }

    // === R5: pending next_call from the most recent worker reportback ===
    // When a worker proposed a back-edge (e.g. information-collector said
    // next_call=requirements-analyst because of a contract gap), the main
    // agent MUST honor it. We surface it here as an explicit directive.
    //
    // Escalation: if the same next_call has been injected on the previous
    // round and is STILL pending (the main agent ignored it), we bump a
    // counter. Above NEXT_CALL_IGNORE_THRESHOLD, the G1 hook in tool-guard.ts
    // upgrades from soft-warn to throw, forcing the main agent to comply.
    const NEXT_CALL_IGNORE_THRESHOLD = 2
    const pendingNextCall = managers.state.governance.pendingNextCall
    const lastInjected = managers.state.governance.lastInjectedNextCall
    if (pendingNextCall) {
      // If this is the same next_call we injected last round, the main agent
      // ignored it. Bump the counter.
      if (lastInjected === pendingNextCall) {
        managers.state.governance.pendingNextCallIgnoredRounds++
      } else {
        managers.state.governance.pendingNextCallIgnoredRounds = 0
      }
      managers.state.governance.lastInjectedNextCall = pendingNextCall

      const ignoredRounds = managers.state.governance.pendingNextCallIgnoredRounds
      const escalationNote = ignoredRounds >= NEXT_CALL_IGNORE_THRESHOLD
        ? `\n**ESCALATION**: this is the ${ignoredRounds + 1}th round this next_call has been pending. The G1 hook will now BLOCK any dispatch other than ${pendingNextCall} until you comply.`
        : ""
      const pendingReason = managers.state.governance.pendingNextCallReason
      injections.push(
        `[AION REPORTBACK — HONOR THIS next_call (R5/R6)]
The most recent worker reportback proposed: next_call=${pendingNextCall}${pendingReason ? `\nReason: ${pendingReason}` : ""}
You MUST dispatch ${pendingNextCall} on this round (or ts-critic for its pre-review if not done yet). This is the worker's explicit re-routing request — do NOT override it with your own judgment. After dispatching, the pending next_call is cleared.${escalationNote}`,
      )
      // Note: we no longer clear pendingNextCall here. It gets cleared in the
      // G1 hook when the main agent actually dispatches the requested agent.
      // This lets us detect "injected but ignored" across rounds.
    } else if (lastInjected) {
      // pendingNextCall was cleared (the main agent complied). Reset counter.
      managers.state.governance.pendingNextCallIgnoredRounds = 0
      managers.state.governance.lastInjectedNextCall = null
    }

    // === R4: carry unresolved issues into this round's context ===
    // When a worker reported unresolved issues / blockers, they MUST be
    // visible in every subsequent dispatch prompt. We surface them here so
    // the main agent cannot lose them between rounds.
    const pendingIssues = managers.state.governance.pendingUnresolvedIssues
    if (pendingIssues && pendingIssues.length > 0) {
      injections.push(
        `[AION UNRESOLVED ISSUES — CARRY FORWARD (R4)]
The following unresolved issues were reported by the most recent worker. You MUST address them in the next dispatch (or in the next worker's prompt):
${pendingIssues.map((s, i) => `${i + 1}. ${s}`).join("\n")}
Do NOT silently drop these. Fold them into the next dispatch as explicit context. If a downstream critic or worker resolves one, you may drop it from this list.`,
      )
    }

    // === A. Visual semantic injection: image read → demand semantic description ===
    if (managers.state.governance.lastReadImageFile) {
      injections.push(
        `[AION VISUAL SEMANTIC] You just read an image file: "${managers.state.governance.lastReadImageFile}". You MUST describe its semantic content in text: what does it show? What patterns, trends, anomalies, or key insights are visible? Record this description in progress or decisions. An image without textual semantic analysis is considered evidence NOT consumed.`,
      )
      managers.state.governance.lastReadImageFile = null
    }

    // === A. Visual test loop pending injection ===
    if (managers.state.governance.visualTestLoopPending && (phase === "implement" || phase === "ts-post-review")) {
      injections.push(
        `[AION VISUAL TEST LOOP] There are un-analyzed visual outputs (plots/charts/figures). Before proceeding to closeout, you MUST: (1) read each output image, (2) describe its semantic content, (3) derive test/rollback actions from the visual evidence. Figures without following analysis = evidence not consumed = visual_test_loop = fail.`,
      )
    }

    // === E. Rebuttal mode injection ===
    if (managers.state.governance.rebuttalMode) {
      injections.push(
        `[AION REBUTTAL MODE] You are in REBUTTAL mode. ts-critic has raised blockers that must be answered POINT-BY-POINT. Use a Markdown table format: | Blocker | Accepted? | Evidence | Fix Plan | Status |. Do NOT skip any blocker. After answering, ts-critic MUST recheck. Rebuttal is a LOOP, not a one-time reply.`,
      )
    }

    // === I. Blind optimism anti-pattern injection ===
    if (managers.state.governance.blindOptimismFlag) {
      injections.push(
        `[AION ANTI-OPTIMISM WARNING] Overconfident language was detected in recent output ("works perfectly", "no issues", "great results", etc.). REMEMBER: single success, local gain, no error, or confident wording is NOT evidence of reliability. You MUST provide concrete evidence: metric values, file paths, statistical tests, error analysis. Re-examine your conclusions with critical rigor.`,
      )
      managers.state.governance.blindOptimismFlag = false
    }

    // Round & phase status on every turn
    const statusLine = `[AION STATUS] Phase: ${phase} | Round: ${round}/${managers.state.rounds.max || "∞"} | Stop signal: ${managers.state.governance.stopSignal} | ts-critic: ${managers.state.governance.lastTsCriticSignal} | c-critic: ${managers.state.governance.lastCCriticVerdict} | Blockers: ${managers.governance.listBlockers().length} | Rebuttal: ${managers.state.governance.rebuttalMode} | Visual pending: ${managers.state.governance.visualTestLoopPending}`
    injections.push(statusLine)

    // === Round budget warning ===
    const budget = PHASE_BUDGET[phase]
    if (budget && round > budget.recommended) {
      injections.push(
        `[AION BUDGET WARNING] Phase "${phase}" has been active for ${round} rounds (recommended: ${budget.recommended}). ${budget.warning}`,
      )
    }

    if (injections.length > 0) {
      output.system.push(...injections)
      info("[aion] system transform: injecting context", {
        intent,
        phase,
        sessionID,
        modelId: model?.id,
        injectionCount: injections.length,
      })
    }
  }
}
