import { tool, type ToolDefinition } from "@opencode-ai/plugin"
import type { CreateToolsArgs } from "./_shared"
import type { AionTools } from "./types"
import { ensureDir, writeFileEnsuringDir, readIfExists } from "../shared/logger"
import { nowIso } from "../shared/utils"

type TodoState = "todo" | "in-progress" | "done"

type TodoItem = {
  id: string
  planStep: string
  branchId: string
  wave: number
  owner: string
  state: TodoState
  frontierState: string
  compareGate: string
  updateTrigger: string
  rollbackRule: string
  loopHandoff: string
  addedAt: string
  updatedAt: string
}

let todoCounter = 0

function parseTodoMap(content: string): TodoItem[] {
  const items: TodoItem[] = []
  const blocks = content.split(/####\s+/).slice(1)
  for (const block of blocks) {
    const idMatch = block.match(/^TODO-(\d+)/)
    if (!idMatch) continue
    const cleanedBlock = block.replace(/\*\*([^*]+)\*\*/g, "$1")
    const getField = (name: string) => {
      const m = cleanedBlock.match(new RegExp(`-\\s*${name}:\\s*(.+)`))
      if (!m) return ""
      return m[1].trim().replace(/\*\*/g, "")
    }
    items.push({
      id: `TODO-${idMatch[1]}`,
      planStep: getField("Plan step"),
      branchId: getField("branch_id"),
      wave: parseInt(getField("Wave") || "0", 10),
      owner: getField("Owner"),
      state: ((getField("State") as TodoState) || "todo").replace(/\*\*/g, "") as TodoState,
      frontierState: getField("Frontier state"),
      compareGate: getField("Compare gate"),
      updateTrigger: getField("Update trigger"),
      rollbackRule: getField("Rollback rule"),
      loopHandoff: getField("Loop handoff"),
      addedAt: getField("added"),
      updatedAt: getField("updated"),
    })
  }
  return items
}

function serializeTodoMap(items: TodoItem[], blockers: string[]): string {
  const itemsSection = items.length > 0
    ? items.map((item) => {
        return `#### ${item.id}

- Plan step: ${item.planStep}
- branch_id: ${item.branchId}
- Wave: ${item.wave}
- Owner: ${item.owner}
- State: **${item.state}**
- Frontier state: ${item.frontierState}
- Compare gate: ${item.compareGate}
- Update trigger: ${item.updateTrigger}
- Rollback rule: ${item.rollbackRule}
- Loop handoff: ${item.loopHandoff}
- added: ${item.addedAt}
- updated: ${item.updatedAt}`
      }).join("\n\n")
    : "(no items yet)"

  const blockersSection = blockers.length > 0
    ? blockers.map((b) => `- ${b}`).join("\n")
    : "(none)"

  return `# TODO Map

_TODO items must not contain meanings like "end", "stop", "wrap up", or "delivery complete". The last item may only be a review action, next-round entry, or loop-back check._

## Plan-to-TODO Mapping

${itemsSection}

## Current Blockers

${blockersSection}

## Stop / Continue Impact

- Updated at: ${nowIso()}
- Total items: ${items.length}
- Done: ${items.filter((i) => i.state === "done").length}
- In-progress: ${items.filter((i) => i.state === "in-progress").length}
- Todo: ${items.filter((i) => i.state === "todo").length}
`
}

export function createTodoTools(args: CreateToolsArgs): Partial<AionTools> {
  const { managers } = args
  const m = managers
  const z = tool.schema

  return {
    aion_todo_update: tool({
      description:
        "Dynamic TODO map manager. This is the ONLY way to update the plan-driven TODO map. The TODO map IS the execution plan — every step must be tracked here. Subagent findings (new routes, blockers, gaps) MUST be reflected as new TODO items or state changes. Call this tool: after each subagent reportback, when blockers appear, when ts-critic requests rollback, and whenever the plan changes.\n\n" +
        "**TUI SYNC PROTOCOL — MANDATORY**: After every successful call to aion_todo_update, you MUST immediately call the built-in `todowrite` tool to mirror the current todo-map state into OpenCode's TUI todo list. The TUI todo list is what the user sees in the right panel. Without this step, the user sees no task progress.\n" +
        "The TUI list should be the FLAT list of plan_step + state, one item per line, e.g.:\n" +
        "- [in_progress] TODO-001: brainstorm task contract with requirements-analyst\n" +
        "- [pending] TODO-002: dispatch parallel EDA + public-solution search\n" +
        "- [completed] TODO-000: ask user about interactive mode\n" +
        "Use status='in_progress' for the active item, 'pending' for upcoming, 'completed' for done. Update the TUI list every time you call aion_todo_update.",
      args: {
        action: z.enum(["add", "update-state", "rollback", "get", "add-from-reportback"]),
        todo_id: z.string().optional().describe("TODO ID (e.g. TODO-001) for update-state/rollback"),
        plan_step: z.string().optional().describe("Description of the plan step (for add)"),
        owner: z.string().optional().describe("Owning agent: requirements-analyst, information-collector, coder, ts-critic, c-critic, main-agent"),
        new_state: z.enum(["todo", "in-progress", "done"]).optional().describe("New state for update-state"),
        branch_id: z.string().default("main"),
        rollback_depth: z.enum(["self", "self-and-downstream", "all-to-plan-step"]).default("self").describe("How far to roll back: self = just this item, self-and-downstream = this + items added after it, all-to-plan-step = reset everything back to a specific plan step"),
        reportback_text: z.string().optional().describe("Raw reportback text from a subagent — will extract suggested_next_step and follow_up_actions automatically"),
        reportback_source: z.string().optional().describe("Agent name that produced the reportback"),
      },
      async execute(args, _context) {
        const todoPath = m.workspace.todoMapPath()
        ensureDir(m.workspace.memoryDir())

        const action = args?.action
        const todoId = args?.todo_id
        const planStep = args?.plan_step
        const owner = args?.owner
        const newState = args?.new_state
        const branchId = args?.branch_id ?? "main"
        const rollbackDepth = args?.rollback_depth ?? "self"
        const reportbackText = args?.reportback_text
        const reportbackSource = args?.reportback_source

        const existing = readIfExists(todoPath) ?? ""
        let items = parseTodoMap(existing)

        if (action === "add" || action === "add-from-reportback") {
          const newItems: TodoItem[] = []

          if (action === "add" && planStep) {
            todoCounter += 1
            const id = `TODO-${todoCounter.toString().padStart(3, "0")}`
            const now = nowIso()
            newItems.push({
              id,
              planStep,
              branchId,
              wave: items.length + 1,
              owner: owner ?? "main-agent",
              state: "todo",
              frontierState: "not-started",
              compareGate: "",
              updateTrigger: "subagent reportback",
              rollbackRule: "ts-critic can roll back to this step",
              loopHandoff: "",
              addedAt: now,
              updatedAt: now,
            })
          }

          if (action === "add-from-reportback" && reportbackText) {
            const text = reportbackText
            const stepMatches = text.match(/(?:suggested[_-]?next[_-]?step|next[_-]?step|follow[_-]?up)[：:\s]*([^\n]+)/gi) ?? []
            const gapMatches = text.match(/(?:remaining[_-]?gaps?|open[_-]?question|still[_-]?need|missing)[：:\s]*([^\n]+)/gi) ?? []

            const allNew = [...stepMatches, ...gapMatches]
            for (const match of allNew) {
              const desc = match.replace(/^[^：:]+[：:]\s*/i, "").trim()
              if (!desc || desc.length < 5) continue
              todoCounter += 1
              const id = `TODO-${todoCounter.toString().padStart(3, "0")}`
              const now = nowIso()
              newItems.push({
                id,
                planStep: desc.slice(0, 200),
                branchId,
                wave: items.length + newItems.length + 1,
                owner: reportbackSource ?? "main-agent",
                state: "todo",
                frontierState: "not-started",
                compareGate: "",
                updateTrigger: `reportback from ${reportbackSource ?? "subagent"}`,
                rollbackRule: "",
                loopHandoff: "",
                addedAt: now,
                updatedAt: now,
              })
            }
          }

          items = [...items, ...newItems]
          const blockers = m.governance.listBlockers().map((b) => `[${b.id}] ${b.description}`)
          writeFileEnsuringDir(todoPath, serializeTodoMap(items, blockers))
          m.trace.appendEvent(
            "memory.sync",
            `todo-map: added ${newItems.length} items (total: ${items.length})`,
            { action, added: newItems.length, total: items.length },
            "main-agent",
          )
          return JSON.stringify({
            action: "add",
            added: newItems.map((i) => ({ id: i.id, planStep: i.planStep })),
            totalItems: items.length,
            summary: { done: items.filter((i) => i.state === "done").length, inProgress: items.filter((i) => i.state === "in-progress").length, todo: items.filter((i) => i.state === "todo").length },
            tui_todos: items.map((i) => ({
              content: `${i.id}: ${i.planStep}`,
              status: i.state === "done" ? "completed" : i.state === "in-progress" ? "in_progress" : "pending",
              priority: "high",
            })),
            next_action: "Call todowrite with tui_todos to sync the OpenCode TUI todo list.",
          }, null, 2)
        }

        if (action === "update-state" && todoId) {
          const item = items.find((i) => i.id === todoId)
          if (!item) {
            return JSON.stringify({ error: `${todoId} not found` }, null, 2)
          }
          const prevState = item.state
          item.state = newState ?? item.state
          item.updatedAt = nowIso()
          if (newState === "in-progress") item.frontierState = "active"
          if (newState === "done") item.frontierState = "completed"

          const blockers = m.governance.listBlockers().map((b) => `[${b.id}] ${b.description}`)
          writeFileEnsuringDir(todoPath, serializeTodoMap(items, blockers))
          m.trace.appendEvent(
            "memory.sync",
            `todo-map: ${item.id} ${prevState} → ${item.state}`,
            { todoId: item.id, from: prevState, to: item.state },
            "main-agent",
          )
          return JSON.stringify({
            action: "update-state",
            todoId: item.id,
            from: prevState,
            to: item.state,
            planStep: item.planStep,
            summary: { done: items.filter((i) => i.state === "done").length, inProgress: items.filter((i) => i.state === "in-progress").length, todo: items.filter((i) => i.state === "todo").length },
            tui_todos: items.map((i) => ({
              content: `${i.id}: ${i.planStep}`,
              status: i.state === "done" ? "completed" : i.state === "in-progress" ? "in_progress" : "pending",
              priority: "high",
            })),
            next_action: "Call todowrite with tui_todos to sync the OpenCode TUI todo list.",
          }, null, 2)
        }

        if (action === "rollback" && todoId) {
          const targetIdx = items.findIndex((i) => i.id === todoId)
          if (targetIdx === -1) {
            return JSON.stringify({ error: `${todoId} not found` }, null, 2)
          }

          const rolledBack: string[] = []
          const now = nowIso()

          if (rollbackDepth === "self") {
            items[targetIdx].state = "todo"
            items[targetIdx].frontierState = "rolled-back"
            items[targetIdx].updatedAt = now
            rolledBack.push(items[targetIdx].id)
          } else if (rollbackDepth === "self-and-downstream") {
            for (let i = targetIdx; i < items.length; i++) {
              if (items[i].state === "done" || items[i].state === "in-progress") {
                items[i].state = "todo"
                items[i].frontierState = "rolled-back"
                items[i].updatedAt = now
                rolledBack.push(items[i].id)
              }
            }
          } else {
            for (const item of items) {
              if (item.state === "done" || item.state === "in-progress") {
                item.state = "todo"
                item.frontierState = "rolled-back"
                item.updatedAt = now
                rolledBack.push(item.id)
              }
            }
          }

          const blockers = m.governance.listBlockers().map((b) => `[${b.id}] ${b.description}`)
          writeFileEnsuringDir(todoPath, serializeTodoMap(items, blockers))
          m.trace.appendEvent(
            "memory.sync",
            `todo-map: rollback depth=${rollbackDepth} affected=[${rolledBack.join(",")}]`,
            { todoId, depth: rollbackDepth, rolledBack },
            "main-agent",
          )
          m.git.autoCommit(`todo rollback: ${rolledBack.length} items reset`)
          return JSON.stringify({
            action: "rollback",
            target: todoId,
            depth: rollbackDepth,
            rolledBack,
            summary: { done: items.filter((i) => i.state === "done").length, inProgress: items.filter((i) => i.state === "in-progress").length, todo: items.filter((i) => i.state === "todo").length },
            tui_todos: items.map((i) => ({
              content: `${i.id}: ${i.planStep}`,
              status: i.state === "done" ? "completed" : i.state === "in-progress" ? "in_progress" : "pending",
              priority: "high",
            })),
            next_action: "Call todowrite with tui_todos to sync the OpenCode TUI todo list.",
          }, null, 2)
        }

        if (action === "get") {
          return JSON.stringify({
            items: items.map((i) => ({
              id: i.id,
              planStep: i.planStep,
              state: i.state,
              owner: i.owner,
              branchId: i.branchId,
            })),
            summary: { done: items.filter((i) => i.state === "done").length, inProgress: items.filter((i) => i.state === "in-progress").length, todo: items.filter((i) => i.state === "todo").length },
            tui_todos: items.map((i) => ({
              content: `${i.id}: ${i.planStep}`,
              status: i.state === "done" ? "completed" : i.state === "in-progress" ? "in_progress" : "pending",
              priority: "high",
            })),
            next_action: "Call todowrite with tui_todos to sync the OpenCode TUI todo list.",
          }, null, 2)
        }

        return JSON.stringify({ error: "unknown action" }, null, 2)
      },
    }),
  }
}
