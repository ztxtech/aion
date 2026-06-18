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
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { AION_SKILLS, SKILL_AGENT_MAP, TS_BOUND_SKILLS } from "../prompts/skill-registry"
import { SCHEDULING_MERMAID, resetWorkerProgress } from "../scheduling/state-machine"

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

const AION_BANNER = `╔══════════════════════════════════════════════════════════════╗
║  AION — Time-Series Multi-Agent Orchestration Plugin       ║
║  Phase-driven loop · Governance gates · Anti-leakage       ║
╚══════════════════════════════════════════════════════════════╝

Available subagents (dispatch via \`task\` tool):
  • requirements-analyst — Task intake, hidden-goal detection
  • information-collector — External evidence & SOTA search
  • coder — Implementation, experiments, deliverables
  • ts-critic — Time-series expert & stop-go governor
  • c-critic — Final gate, highest authority, cold-start review

Governance order: c-critic > ts-critic > main agent > other subagents

Loop lifecycle: init → gather → ts-pre-review → implement → ts-post-review → c-critic-final → done
                               ↑                                    ↓
                               └────────── loop-back ←─────────────┘

Current phase will be shown in every turn. You MUST follow the phase-specific instructions.`

function discoverEnvironment(directory: string): string | null {
  const sections: string[] = []

  // 1. Discover agent definitions
  const agents: string[] = ["aion", "requirements-analyst", "information-collector", "coder", "ts-critic", "c-critic"]
  const agentsDir = join(directory, ".opencode", "agents")
  if (existsSync(agentsDir)) {
    try {
      const { readdirSync } = require("node:fs")
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
  if (existsSync(ocJsonPath)) {
    try {
      const raw = readFileSync(ocJsonPath, "utf-8")
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
      const parsed = JSON.parse(stripped)
      if (parsed && typeof parsed === "object" && parsed.agent && !Array.isArray(parsed.agent)) {
        for (const name of Object.keys(parsed.agent as Record<string, unknown>)) {
          if (!agents.includes(name)) agents.push(name)
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  // 2. Plugins
  const aionPlugins: string[] = []
  const aionJsoncPath = join(directory, ".opencode", "aion.jsonc")
  if (existsSync(aionJsoncPath)) aionPlugins.push("aion")
  const pluginsDir = join(directory, ".opencode", "plugins")
  if (existsSync(pluginsDir)) {
    try {
      const { readdirSync } = require("node:fs")
      const files = readdirSync(pluginsDir)
      for (const f of files) {
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
  if (existsSync(ocJsonPath)) {
    try {
      const raw = readFileSync(ocJsonPath, "utf-8")
      const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
      const parsed = JSON.parse(stripped)
      if (parsed && typeof parsed === "object" && parsed.mcp_servers && !Array.isArray(parsed.mcp_servers)) {
        for (const name of Object.keys(parsed.mcp_servers as Record<string, unknown>)) {
          mcpServers.push(name)
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Skills from .opencode/skills/ (local) + ~/.config/opencode/skills/ (global)
  const skills: string[] = []
  const skillsDir = join(directory, ".opencode", "skills")
  if (existsSync(skillsDir)) {
    try {
      const { readdirSync } = require("node:fs")
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
  const globalSkillsDir = join(process.env.HOME || "/tmp", ".config", "opencode", "skills")
  if (existsSync(globalSkillsDir)) {
    try {
      const { readdirSync } = require("node:fs")
      const entries = readdirSync(globalSkillsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory() && !skills.includes(entry.name)) {
          skills.push(entry.name + " (global)")
        } else if (entry.name.endsWith(".md") && !skills.includes(entry.name.replace(/\.md$/, ""))) {
          skills.push(entry.name.replace(/\.md$/, "") + " (global)")
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

  // 5. Skills with descriptions (from built-in registry)
  const availableSkills = AION_SKILLS.filter((s) => s.name !== "template")
  const skillLines = availableSkills.map(
    (s) => `- **${s.name}**: ${s.description} (trigger: ${s.trigger})`,
  )
  sections.push("")
  sections.push("## Available AION Skills (invoke via skill tool or reference in dispatch prompts)")
  sections.push(skillLines.join("\n"))

  // 6. Time-series binding section
  sections.push("")
  sections.push(`## Time-Series Bound Skills (MUST be referenced when task involves time-series, forecasting, signal analysis, or temporal data)`)
  sections.push(TS_BOUND_SKILLS.map((s) => `- ${s}`).join(", "))
  sections.push("When the task involves time-series as a major dimension, you MUST reference these skills in your dispatch prompts and apply their rules throughout the flow.")

  if (sections.length === 0) return null
  return `[AION ENVIRONMENT — Available in this OpenCode session]\n${sections.join("\n")}\n\nYou MAY use any of these agents, MCP servers, and skills to accomplish the task. When dispatching subagents, include relevant skill names and rules in the prompt so they can leverage them too.`
}

export function createSystemTransformHook(args: CreateHooksArgs): AionSystemTransformHook {
  const { ctx, managers } = args
  let bannerShown = false

  return async function onSystemTransform(input, output) {
    const { sessionID, model } = input
    const intent: AionIntent = (managers.state._lastIntent as AionIntent) ?? "general"
    const phase: AionPhase = managers.phase.current()
    const modelId = model?.id ?? "unknown"
    const round = managers.state.rounds.current

    // Inject banner on first turn
    if (!bannerShown) {
      const banner = `${AION_BANNER}\n\nModel: ${modelId}\nPhase: ${phase}\nRound: ${round}`
      output.system.push(banner)
      bannerShown = true
    }

    const injections = getFullSystemInjection(
      ctx.directory,
      intent,
      sessionID,
    )

    // === Environment discovery: inject available skills, MCP servers, and agents ===
    const envInfo = discoverEnvironment(ctx.directory)
    if (envInfo) {
      injections.push(envInfo)
    }

    // === Shared cache protocol: enforce read/write of .opencode/memory/ + trace.md across agents ===
    const sharedCacheProtocol = `[AION SHARED CACHE PROTOCOL — APPLIES TO ALL AGENTS EXCEPT c-critic]
\`\`\`
.opencode/memory/  = shared whiteboard / cache (READ + WRITE for all agents except c-critic)
.opencode/trace.md  = shared event bus       (append-only, all agents can append)
\`\`\`

- ALL agents (main, requirements-analyst, information-collector, coder, ts-critic) have READ access to all .opencode/memory/ files.
- ALL agents have WRITE access via the \`aion_memory_sync\` tool. Going through this tool is the only sanctioned write path for memory files (do NOT use the generic \`write\` tool on .opencode/memory/).
- trace.md is appended via the trace system — never overwrite it with the generic \`write\` tool.
- Before dispatching a subagent, READ the latest .opencode/memory/progress.md + decisions.md + negative.md and pass a 1-2 sentence summary in the dispatch prompt. This avoids the subagent re-deriving context that already exists.
- When a subagent reports back, EXTRACT any new findings and append them to the relevant memory artifact via aion_memory_sync so the NEXT round inherits the knowledge.
- c-critic is the EXCEPTION: it runs under minimal context and may NOT use memory files as source-of-truth.`
    injections.push(sharedCacheProtocol)
    // === C. Debug prefix enforcement ===
    const debugPrefix = `[AION FORMAT RULE] Every response MUST start with: [Agent: <your-name>] Follow: <active rules/skills>; Current step: <one-line note>. The Follow field must only contain real active gates (e.g. ts-critic, rebuttal, core). Do NOT include deprecated phrases like "minimum rounds" or "default three rounds". Keep the prefix short and grep-able.`

    // === Loop control: NEVER stop unless c-critic approves ===
    const noStopRule = `[AION LOOP CONTROL — CRITICAL]
You are inside an autonomous multi-agent loop. You MUST NOT end your turn without calling at least one tool. Every response MUST end with a tool call (aion_todo_update, aion_memory_sync, aion_compaction, task, etc.). The loop will NOT stop unless ALL of these conditions are true:
  1. Phase is "done"
  2. c-critic has explicitly output "approve-stop" via aion_critic_verdict
  3. aion_pre_stop_gate returned allowStop=true
  4. No open governance blockers exist
If you have nothing left to do in this phase, call aion_todo_update(action="update-state") or aion_memory_sync to advance state. NEVER output a plain text conclusion without a tool call. If you are stuck, call aion_todo_update(action="get") to review the plan.`
    // === Language: session-start question OR config-default fallback ===
    // The LLM is supposed to ask the user via the 'question' tool on round 1.
    // The user's answer triggers aion_set_language, which resolves the state
    // with source="session-start". If the LLM never asks (skipped the
    // directive, or this isn't round 1 anymore), we fall back to the config
    // default so the loop can keep moving.
    if (managers.state.governance.languageResolved === "unset") {
      if (round <= 1) {
        // Round 1: inject the MANDATORY ask directive. Do NOT resolve yet —
        // wait for the LLM to actually call aion_set_language.
        injections.push(
          `[AION LANGUAGE — ASK THE USER NOW (MANDATORY)]
You MUST use OpenCode's 'question' tool on your FIRST turn to ask the user which language they want for interaction and delivery. Offer these options:
  - "English everywhere"  (mode: en)
  - "Chinese reasoning + English delivery"  (mode: zh-reason-en-deliver)
  - "Chinese delivery throughout"  (mode: zh-deliver)
  - "Bilingual (Chinese + English)"  (mode: bilingual)
After the user answers, call aion_set_language(mode=<choice>) to lock it in.
Do NOT proceed with the task until you have asked this question.`,
        )
      } else {
        // Round > 1 and still unset: LLM skipped the question. Fall back.
        const langMode = managers.config.language?.mode ?? "en"
        managers.language.resolve(langMode, "config-default")
      }
    }

    // === Language: inject directive every turn ===
    const langMode = managers.language.getMode()
    const langEffectMap: Record<string, string> = {
      "en": "Use English everywhere — reasoning, interaction, delivery.",
      "zh-reason-en-deliver": "Use Chinese for interaction and reasoning. Final code, API names, variable names, and delivery artifacts must be in English.",
      "zh-deliver": "Use Chinese for all delivery and interaction.",
      "bilingual": "Deliver in both Chinese and English.",
    }
    const langDirective = `[AION LANGUAGE] ${langEffectMap[langMode] ?? langEffectMap["en"]}`
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
Do NOT proceed with the task until you have asked BOTH this question AND the language question.`,
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

    injections.push(debugPrefix)
    injections.push(noStopRule)

    // === Anti-stop contamination: ONLY critics know "stop". All other agents loop forever. ===
    const antiStopRule = `[AION ANTI-STOP CONTAMINATION — CRITICAL]
The concept of "stopping" does NOT exist for you, the main agent, or any subagent except ts-critic and c-critic. ONLY critics can decide to stop. You and all subagents operate under the assumption that the loop NEVER ends — you always have more work to do, more branches to explore, more evidence to gather.

Rules:
1. TODO items MUST NOT contain ANY of these words: end, stop, wrap up, delivery complete, finalize, close out, finish up, all done, nothing left, no more work, task complete. If you catch yourself writing any of these in a TODO, DELETE it immediately and replace with a concrete NEXT ACTION (e.g., "run ablation on model X", "search for method family Y", "plot residuals for experiment Z").
2. When you think "we're almost done", that is a signal to call brain-storm to OPEN NEW ROUTES, not to wind down. The loop WIDENS near the end, never narrows.
3. "No more work to do" is NEVER true. If you cannot think of what to do next, call aion_todo_update(action="get") to review the plan, then call brain-storm or deep-reasoning to find new branches.
4. Your dispatch prompts to subagents MUST NOT say "this is the last round" or "we're wrapping up". Every dispatch should read as if the loop has 10 more rounds to go.
5. Only ts-critic and c-critic may use the words "stop", "allow-stop", "approve-stop", "reject-stop". These words are FORBIDDEN in your own reasoning and in any TODO content.`
    injections.push(antiStopRule)

    // === TODO map as driving plan + TUI sync drift detection ===
    const todoContent = readIfExists(managers.workspace.todoMapPath())
    let todoMapUpdatedAt: string | null = null
    let todoMapItems: Array<{ id: string; planStep: string; state: string }> = []
    if (todoContent && todoContent.length > 50) {
      const todoLines = todoContent.split("\n")
      const summaryLines = todoLines.filter((l) => l.match(/^[-*]\s*(Total|Done|In-progress|Todo):/) || l.match(/^####\s*TODO-/))
      if (summaryLines.length > 0) {
        injections.push(
          `[AION TODO MAP — THIS IS YOUR DRIVING PLAN]\nThe todo-map IS the execution plan. You MUST follow it step by step. After each subagent reportback, call aion_todo_update to reflect progress. If a subagent found new gaps or suggested next steps, call aion_todo_update(action="add-from-reportback") to expand the plan.\n\n${summaryLines.join("\n")}`,
        )
      }
      // Parse "Updated at:" line in the Stop/Continue Impact section.
      const updatedMatch = todoContent.match(/-\s*Updated at:\s*(\S+)/)
      if (updatedMatch) todoMapUpdatedAt = updatedMatch[1]
      // Parse the per-item blocks to build a TUI-sync payload.
      const blocks = todoContent.split(/####\s+/).slice(1)
      for (const block of blocks) {
        const idMatch = block.match(/^TODO-(\d+)/)
        if (!idMatch) continue
        const cleaned = block.replace(/\*\*([^*]+)\*\*/g, "$1")
        const planStep = (cleaned.match(/-\s*Plan step:\s*(.+)/)?.[1] ?? "").trim()
        const state = ((cleaned.match(/-\s*State:\s*(.+)/)?.[1] ?? "todo").trim().toLowerCase().replace(/\s+/g, "-"))
        todoMapItems.push({ id: `TODO-${idMatch[1]}`, planStep, state })
      }
    } else {
      injections.push(
        `[AION TODO MAP] No plan steps exist yet. You MUST create the initial plan: call aion_todo_update(action="add", plan_step="...") for each major step after requirements-analyst reports back.`,
      )
    }

    // === TUI todo sync drift detection ===
    // Fire the MANDATORY sync reminder whenever:
    //   (a) aion_todo_update just fired (existing trigger), OR
    //   (b) the on-disk todo-map has been updated more recently than the last
    //       `todowrite` call (or todowrite was never called). Without this
    //       second branch, an agent that skips aion_todo_update entirely will
    //       leave the TUI permanently empty — the bug the user reported.
    const tuiLastSyncedAt = managers.state.governance.tuiTodoLastSyncedAt
    const todoMapIsNewer =
      todoMapUpdatedAt !== null &&
      (tuiLastSyncedAt === null || todoMapUpdatedAt > tuiLastSyncedAt)
    const tuiStale = managers.state.governance.tuiTodoSyncPending || todoMapIsNewer
    if (tuiStale && todoMapItems.length > 0) {
      const tuiPayload = JSON.stringify(
        todoMapItems.map((i) => ({
          content: `${i.id}: ${i.planStep}`,
          status:
            i.state === "done"
              ? "completed"
              : i.state === "in-progress"
                ? "in_progress"
                : "pending",
          priority: "high",
        })),
        null,
        2,
      )
      injections.push(
        `[AION TUI TODO SYNC — MANDATORY NEXT STEP — DO NOT SKIP]
The OpenCode TUI todo list (the right panel the user is watching) is OUT OF SYNC with the todo-map.
You MUST call the built-in \`todowrite\` tool NOW with the EXACT payload below. Do not modify, do not re-derive, do not skip.

\`\`\`json
${tuiPayload}
\`\`\`

After calling todowrite, the TUI list will reflect the current plan. The user has ZERO visibility into task progress without this step — they will assume the loop is hung if the right panel stays empty.
If you have not yet called aion_todo_update in this round, you ALSO need to call it (action="update-state" or "add") to bring the on-disk map in line with the work you just did. todowrite mirrors the map into the TUI; aion_todo_update mutates the map.`,
      )
    }

    const phaseHint = PHASE_SYSTEM_HINTS[phase]
    if (phaseHint) {
      injections.push(phaseHint)
    }

    // === Serial-loop scheduling diagram (injected once per session) ===
    // The Mermaid diagram is the canonical description of legal transitions.
    // We inject it every turn alongside the phase hint so the LLM always has
    // it in context. The G1 hook backs it up with hard edge checks.
    if (phase !== "done") {
      injections.push(`[AION SCHEDULING — Serial-Loop State Machine]\n${SCHEDULING_MERMAID}`)
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
