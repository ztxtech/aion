import type { AgentGraph, AgentRunState } from "./call-graph"
import type { PlanGraph, PlanState } from "./plan-graph"

export type BoardState = PlanState | AgentRunState

export type BoardListItem = {
  id: string
  state: BoardState
  title: string
  detail: string
}

export type AgentBoardView = {
  items: BoardListItem[]
  summary: string
}

function planState(state: PlanState): BoardState {
  return state === "in-progress" ? "active" : state
}

function activeIcon(tick: number) {
  return ["●", "◆", "●", "◇"][Math.abs(tick) % 4]
}

export function boardStateIcon(state: BoardState, tick = 0) {
  if (state === "done") return "✓"
  if (state === "blocked") return "✗"
  if (state === "active") return activeIcon(tick)
  return "○"
}

function orderedIds(graph: PlanGraph) {
  const seen = new Set<string>()
  const ids: string[] = []
  for (const id of [...graph.layers.flat(), ...graph.items.map((item) => item.id)]) {
    if (seen.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}

export function executionListItems(graph: PlanGraph): BoardListItem[] {
  const byId = new Map(graph.items.map((item) => [item.id, item]))
  return orderedIds(graph).flatMap((id) => {
    const item = byId.get(id)
    if (!item) return []
    const dependencies = item.dependsOn.length > 0
      ? ` · after ${item.dependsOn.join(", ")}`
      : ""
    return [{
      id,
      state: planState(item.state),
      title: item.planStep || "pending detail",
      detail: `${item.owner || "unassigned"} · w${item.wave || 1}${dependencies}`,
    }]
  })
}

export function executionListLine(item: BoardListItem, tick = 0) {
  return `${boardStateIcon(item.state, tick)} ${item.id} ${item.title} · ${item.detail}`
}

const AGENT_ORDER = [
  "aion",
  "requirements-analyst",
  "information-collector",
  "coder",
  "ts-critic",
  "c-critic",
  "search-scout",
  "experiment-runner",
]

export function agentActivityView(graph: AgentGraph): AgentBoardView {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const ids = [
    ...AGENT_ORDER.filter((id) => byId.has(id)),
    ...graph.nodes.map((node) => node.id).filter((id) => !AGENT_ORDER.includes(id)),
  ]
  const items = ids.flatMap((id) => {
    const node = byId.get(id)
    if (!node) return []
    return [{
      id,
      state: node.state,
      title: id,
      detail: `${node.dispatches}↑ · ${node.returns}↓`,
    }]
  })
  return {
    items,
    summary: `${graph.summary.done} done · ${graph.summary.blocked} blocked · ${graph.summary.allow} allow · ${graph.summary.reject} reject`,
  }
}

export function agentListLine(item: BoardListItem, tick = 0) {
  return `${boardStateIcon(item.state, tick)} ${item.id} · ${item.detail}`
}
