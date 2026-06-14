/**
 * Memory and workspace-initialization tools.
 *
 * `aion_memory_sync` — append, replace-section, or fully-replace one of the
 *   10 memory artifacts (progress, features, decisions, todo-map,
 *   completion-gate, positive, negative, relation, initial-prompt,
 *   context-snapshot). Each write is attributed to the calling agent and
 *   traced.
 * `aion_workspace_init` — the init-phase bootstrap: persists the user's
 *   original prompt, creates the context-snapshot, and seeds the todo-map.
 */
import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { appendToFile, ensureDir, writeFileEnsuringDir, readIfExists } from "../shared/logger"
import { nowIso } from "../shared/utils"

export function createMemoryTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_memory_sync: tool({
      description:
        "Memory-sync tool — the SHARED COMMUNICATION CHANNEL between all subagents and the main agent. Writes to a structured memory file under .opencode/memory/. Each memory artifact is fixed-typed and indexed.\n\n" +
        "**SHARED CACHE — ALL AGENTS READ AND WRITE**: Every agent (main agent, requirements-analyst, information-collector, coder, ts-critic, c-critic) shares the same .opencode/memory/ directory. Treat it as a shared whiteboard / cache. Read it before starting work (avoid re-deriving from scratch). Write findings so other agents don't re-do your work.\n\n" +
        "**WRITE PROTOCOL**: Going through this tool is the only sanctioned write path. Do NOT use the generic `write` tool to write to .opencode/memory/ directly. The tool guarantees append-only, traceable, and agent-attributed writes.\n\n" +
        "**ARTIFACT ROLES**:\n" +
        "- `initial-prompt`: anti-drift baseline (write once, never overwrite)\n" +
        "- `context-snapshot`: canonical compaction artifact (refresh before critic reviews, after plan switches)\n" +
        "- `progress`: current stage, finished, next-step\n" +
        "- `features`: delivered/planned features + evidence\n" +
        "- `decisions`: structural + deferred decisions\n" +
        "- `todo-map`: plan-step ↔ OpenCode TODO mapping (driven by aion_todo_update)\n" +
        "- `completion-gate`: pre-stop gate state\n" +
        "- `positive`: verified positive priors\n" +
        "- `negative`: failed assumptions, no-go zones\n" +
        "- `relation`: role relations + call paths",
      args: {
        artifact: z.enum([
          "initial-prompt",
          "context-snapshot",
          "progress",
          "features",
          "decisions",
          "todo-map",
          "completion-gate",
          "positive",
          "negative",
          "relation",
        ]),
        section: z.string().default("main").describe("Section within the artifact, e.g. 'blockers' or 'next_dispatch'"),
        content: z.string().describe("Markdown content to write into the section"),
        mode: z.enum(["append", "replace-section", "replace"]).default("append"),
      },
      async execute(args, _context) {
        const path = `${m.workspace.memoryDir()}/${args.artifact}.md`
        ensureDir(m.workspace.memoryDir())

        const section = args.section ?? "main"
        const content = args.content ?? ""
        const mode = args.mode ?? "append"

        // Determine the calling agent: prefer _context.agent if OpenCode SDK exposes it,
        // else fall back to the active subagent type from governance state, else "main-agent".
        const ctxAny = _context as { agent?: string; subagent_type?: string }
        const callingAgent =
          ctxAny.agent ??
          ctxAny.subagent_type ??
          m.state.governance.lastDispatchTarget ??
          "main-agent"

        if (mode === "replace") {
          const stamp = `<!-- aion.memory-sync ${nowIso()} artifact=${args.artifact} section=${section} agent=${callingAgent} -->`
          writeFileEnsuringDir(path, `${stamp}\n\n${content}\n`)
        } else if (mode === "replace-section") {
          const existing = readIfExists(path) ?? ""
          const sectionHeader = `## ${section}`
          const stamp = `<!-- aion.memory-sync ${nowIso()} artifact=${args.artifact} section=${section} agent=${callingAgent} -->`
          const newBlock = `${sectionHeader}\n\n${stamp}\n${content}\n`
          const sectionRegex = new RegExp(`${sectionHeader}\\n[\\s\\S]*?(?=\\n## |$)`, "m")
          const updated = sectionRegex.test(existing)
            ? existing.replace(sectionRegex, newBlock)
            : `${existing}\n\n${newBlock}`
          writeFileEnsuringDir(path, updated)
        } else {
          const stamp = `<!-- aion.memory-sync ${nowIso()} artifact=${args.artifact} section=${section} agent=${callingAgent} -->`
          appendToFile(path, `\n${stamp}\n${content}\n`)
        }

        m.trace.appendEvent(
          "memory.sync",
          `memory_sync: ${args.artifact}#${section} (${mode}) by ${callingAgent}`,
          { artifact: args.artifact, section, mode, agent: callingAgent },
          callingAgent,
        )

        return `wrote ${args.artifact}#${section} (${mode}) to ${path} (agent=${callingAgent})`
      },
    }),

    aion_workspace_init: tool({
      description:
        "Workspace initializer. Creates .opencode/, .opencode/memory/, .opencode/trace.md, .opencode/memory/initial-prompt.md (anti-drift baseline) and a fresh .opencode/memory/context-snapshot.md. Idempotent — safe to call multiple times. This is the HARD entry point for every task; ts-critic and c-critic both check that this ran.",
      args: {
        initial_prompt: z.string().describe("The original task prompt; this becomes the anti-drift baseline"),
        task_goal: z.string().optional(),
        evaluation: z.string().optional(),
        non_goals: z.string().optional(),
      },
      async execute(args, _context) {
        const initialPrompt = args?.initial_prompt ?? ""
        const taskGoal = args?.task_goal
        const evaluation = args?.evaluation
        const nonGoals = args?.non_goals
        ensureDir(m.workspace.memoryDir())

        const initialPath = m.workspace.initialPromptPath()
        const initialContent = `# Initial Prompt (anti-drift baseline)\n\n> append-only. do not overwrite this block.\n\n## Original Prompt\n\n${initialPrompt}\n\n${taskGoal ? `## Task Goal\n\n${taskGoal}\n` : ""}${evaluation ? `## Evaluation\n\n${evaluation}\n` : ""}${nonGoals ? `## Non-Goals\n\n${nonGoals}\n` : ""}`
        writeFileEnsuringDir(initialPath, initialContent)

        const snapshotPath = m.workspace.snapshotPath()
        const snapshot = `# Context Snapshot\n\n_generated: ${nowIso()}_\n\n## Task Anchors\n\n- goal: ${taskGoal ?? "(unset)"}\n- evaluation: ${evaluation ?? "(unset)"}\n- non_goals: ${nonGoals ?? "(unset)"}\n\n## Current Phase\n\n- phase: workspace-init\n- round: 0\n\n## Explicit Constraints\n\n- governance: c-critic > ts-critic > main agent > other subagents\n- leakage: hard-blocked (future info / hidden-set / credentials / prompts / memory)\n- stops: only allow-stop lifts the no-stop order\n\n## Most Obvious Gaps\n\n- (no gaps yet)\n\n## Default Next-Dispatch Focus\n\n- requirements-analyst + information-collector in parallel\n`
        writeFileEnsuringDir(snapshotPath, snapshot)

        m.trace.appendEvent(
          "file.written",
          `workspace_init: initial-prompt + context-snapshot + todo-map`,
          { initialPath, snapshotPath },
          "main-agent",
        )

        const todoPath = m.workspace.todoMapPath()
        writeFileEnsuringDir(todoPath, `# TODO Map\n\n_TODO items must not contain meanings like "end", "stop", "wrap up", or "delivery complete". The last item may only be a review action, next-round entry, or loop-back check._\n\n## Plan-to-TODO Mapping\n\n(no items yet — call aion_todo_update with action="add" to create plan steps)\n\n## Current Blockers\n\n(none)\n\n## Stop / Continue Impact\n\n- Updated at: ${nowIso()}\n- Total items: 0\n- Done: 0\n- In-progress: 0\n- Todo: 0\n`)

        return `workspace initialized: ${initialPath}, ${snapshotPath}, ${todoPath}`
      },
    }),
  }
}
