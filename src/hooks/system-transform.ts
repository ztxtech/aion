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

const PHASE_SYSTEM_HINTS: Record<AionPhase, string> = {
  init: `[AION PHASE HINT: INIT] You are in the initialization phase. Your MANDATORY first actions, in this exact order:
1. Call question() to ask the user about interactive vs autonomous mode, then call aion_set_interactive_mode
2. Call aion_workspace_init
3. Call aion_memory_sync artifact="initial-prompt"
4. Call aion_memory_sync artifact="context-snapshot"
5. MANDATORY: dispatch task(subagent_type="requirements-analyst", description="brain-storm: extract task contract, hidden goals, dual-branch plan") — ALWAYS, even for "simple" tasks
6. MANDATORY: dispatch task(subagent_type="coder", description="deep-reasoning: structural analysis, edge cases, approach verification") — ALWAYS, after brainstorm reports back or in parallel if appropriate
7. MANDATORY: dispatch task(subagent_type="information-collector", description="sota-evidence: exhaustive multi-axis search") — AFTER brainstorm+deep-reasoning have clarified axes, ALWAYS
Do NOT skip brainstorm, deep-reasoning, or information-collection. They are ALL mandatory for every task.`,
  gather: `[AION PHASE HINT: GATHER] You are gathering requirements and information. You MUST have dispatched ALL THREE of: brainstorm (requirements-analyst), deep-reasoning (coder), and information-collector. If ANY of these has NOT been dispatched yet, dispatch them NOW. Only after ALL THREE have reported back should you proceed to ts-pre-review.`,
  "ts-pre-review": `[AION PHASE HINT: TS-PRE-REVIEW] ts-critic should be reviewing the plan. If not dispatched yet, dispatch it now via aion_critic_dispatch("ts-critic", goal, artifacts). Wait for its verdict before coding.`,
  implement: `[AION PHASE HINT: IMPLEMENT] You should be dispatching coder to implement. If coder has not been dispatched, dispatch it now with full context from requirements + information + ts-critic pre-review.`,
  "ts-post-review": `[AION PHASE HINT: TS-POST-REVIEW] ts-critic should be reviewing implementation results. If not dispatched, dispatch it via aion_critic_dispatch("ts-critic", goal, artifacts). Address any blockers before attempting closeout.`,
  "c-critic-final": `[AION PHASE HINT: C-CRITIC-FINAL] This is the final governance gate. You MUST dispatch c-critic for a minimal-context cold-start review. If not dispatched, do it now: task(subagent_type="c-critic", description="Final closeout review", prompt="...")`,
  "loop-back": `[AION PHASE HINT: LOOP-BACK] Closeout was rejected. You MUST restart gathering. Dispatch requirements-analyst to rebuild the problem list, then information-collector for missing evidence.`,
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
    const teamMode = managers.config.teamMode.enabled
    const round = managers.state.rounds.current

    // Inject banner on first turn
    if (!bannerShown) {
      const banner = `${AION_BANNER}\n\nModel: ${modelId}\nTeam mode: ${teamMode ? "ON" : "OFF"}\nPhase: ${phase}\nRound: ${round}`
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

    // === Interactive mode: session-start MANDATORY question ===
    // On the FIRST turn of every session, the LLM MUST ask the user whether they
    // want interactive mode (loop pauses for the user between rounds) or fully
    // autonomous mode. This binding is fixed for the rest of the session unless
    // the user explicitly says otherwise.
    if (managers.state.governance.interactiveModeResolved === "unset" && round <= 1) {
      const configDefault = managers.config.interactiveMode.enabled
      managers.interactiveMode.resolve(
        configDefault ? "interactive" : "autonomous",
        "config-default",
      )
      if (!configDefault) {
        injections.push(
          `[AION INTERACTIVE MODE — AUTO-RESOLVED]
Session mode has been set to FULLY AUTONOMOUS based on config (interactiveMode.enabled=false).
The loop will run to completion without asking between rounds.
Do NOT ask the user about mode. Proceed with the task immediately.
The user can switch to interactive at any time by saying "switch to interactive" or "ask me between rounds".`,
        )
      } else {
        injections.push(
          `[AION INTERACTIVE MODE — CONFIG SAYS INTERACTIVE]
Session mode has been set to INTERACTIVE based on config (interactiveMode.enabled=true).
After c-critic approves closeout, the loop will pause and ask the user whether to continue.
The user can switch to autonomous at any time by saying "switch to autonomous" or "I'm leaving".
If you are uncertain about a decision mid-loop, you MAY use the 'question' tool to ask the user.
Do NOT ask the user about mode — it is already resolved from config.`,
        )
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

    // === TUI todo sync reminder: if aion_todo_update just fired, force a todowrite call ===
    if (managers.state.governance.tuiTodoSyncPending) {
      const tuiTodoSyncReminder = `[AION TUI TODO SYNC — MANDATORY NEXT STEP]
You just called aion_todo_update. The TUI todo list (visible to the user in the right panel) HAS NOT been updated.
You MUST call the built-in \`todowrite\` tool NOW to mirror the aion_todo_update state into OpenCode's TUI todo list.
Format each item as: \`{ content: "TODO-NNN: <plan_step>", status: "pending"|"in_progress"|"completed", priority: "high" }\`
The TUI list is the user's only visibility into task progress. Do not proceed with the next dispatch until the TUI list is in sync.`
      injections.push(tuiTodoSyncReminder)
    }

    const phaseHint = PHASE_SYSTEM_HINTS[phase]
    if (phaseHint) {
      injections.push(phaseHint)
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

    // === TODO map as driving plan ===
    const todoContent = readIfExists(managers.workspace.todoMapPath())
    if (todoContent && todoContent.length > 50) {
      const todoLines = todoContent.split("\n")
      const summaryLines = todoLines.filter((l) => l.match(/^[-*]\s*(Total|Done|In-progress|Todo):/) || l.match(/^####\s*TODO-/))
      if (summaryLines.length > 0) {
        injections.push(
          `[AION TODO MAP — THIS IS YOUR DRIVING PLAN]\nThe todo-map IS the execution plan. You MUST follow it step by step. After each subagent reportback, call aion_todo_update to reflect progress. If a subagent found new gaps or suggested next steps, call aion_todo_update(action="add-from-reportback") to expand the plan.\n\n${summaryLines.join("\n")}`,
        )
      }
    } else {
      injections.push(
        `[AION TODO MAP] No plan steps exist yet. You MUST create the initial plan: call aion_todo_update(action="add", plan_step="...") for each major step after requirements-analyst reports back.`,
      )
    }

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
