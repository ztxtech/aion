import type { AgentGraph, AgentRunState } from "./call-graph"
import type { PlanGraph } from "./plan-graph"

export type PlanNodeState = "todo" | "active" | "done"

export type BoardNode = {
  id: string
  label: string
  state: PlanNodeState | AgentRunState
  lines: [string, string, string]
}

export type BoardRow = {
  nodes: BoardNode[]
  connectors: string[]
}

export type ExecutionBoard = {
  rows: BoardRow[]
  nodeWidth: number
  gap: number
}

type LayoutOptions = {
  columns?: number
  nodeWidth?: number
  gap?: number
  indent?: number
}

const DEFAULT_COLUMNS = 80
const DEFAULT_NODE_WIDTH = 24
const DEFAULT_GAP = 2
const DEFAULT_INDENT = 2

function fit(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, Math.max(0, width - 1))}…` : value
}

function centers(length: number, options: Required<Pick<LayoutOptions, "nodeWidth" | "gap" | "indent">>) {
  return Array.from({ length }, (_, index) =>
    options.indent + index * (options.nodeWidth + options.gap) + Math.floor(options.nodeWidth / 2),
  )
}

function connectorGrid(
  from: number[],
  to: number[],
  edges: Array<{ from: string; to: string }>,
  slots: Map<string, { row: number; index: number }>,
  fromRow: number,
  toRow: number,
  width: number,
) {
  const grid = Array.from({ length: 3 }, () => Array.from({ length: width }, () => " "))
  const drawVertical = (line: number, column: number) => {
    if (column >= 0 && column < width) grid[line][column] = "│"
  }

  for (const edge of edges) {
    const source = slots.get(edge.from)
    const target = slots.get(edge.to)
    if (!source || !target) continue
    if (source.row !== fromRow || target.row !== toRow) continue

    const a = from[source.index] ?? from[0] ?? 0
    const b = to[target.index] ?? to[0] ?? a
    drawVertical(0, a)
    drawVertical(1, a)
    drawVertical(1, b)
    const start = Math.min(a, b)
    const end = Math.max(a, b)
    for (let column = start; column <= end; column += 1) {
      if (column !== a && column !== b) grid[1][column] = "─"
    }
    if (b >= 0 && b < width) grid[2][b] = "▼"
  }

  return grid.map((line) => line.join("").trimEnd())
}

function planState(state: PlanGraph["items"][number]["state"]): PlanNodeState {
  return state === "done" ? "done" : state === "in-progress" ? "active" : "todo"
}

function planIcon(state: PlanNodeState) {
  return state === "done" ? "✓" : state === "active" ? "●" : "○"
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return []
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

export function executionLayerRows(
  graph: PlanGraph,
  options: LayoutOptions = {},
): ExecutionBoard {
  const nodeWidth = options.nodeWidth ?? DEFAULT_NODE_WIDTH
  const gap = options.gap ?? DEFAULT_GAP
  const indent = options.indent ?? DEFAULT_INDENT
  const columns = Math.max(nodeWidth + indent, options.columns ?? DEFAULT_COLUMNS)
  const perRow = Math.max(
    1,
    Math.floor((columns - indent + gap) / (nodeWidth + gap)),
  )
  const itemById = new Map(graph.items.map((item) => [item.id, item]))
  const slots = new Map<string, { row: number; index: number }>()
  const rows: BoardRow[] = []
  const width = indent + perRow * (nodeWidth + gap) - gap

  graph.layers.forEach((layer) => {
    for (const group of chunk(layer, perRow)) {
      const rowIndex = rows.length
      const nodes = group.map((id, index) => {
        slots.set(id, { row: rowIndex, index })
        const item = itemById.get(id)
        const state = planState(item?.state ?? "todo")
        const dependencies = (item?.dependsOn ?? []).filter((parent) =>
          itemById.has(parent),
        )
        return {
          id,
          state,
          label: id,
          lines: [
            `${planIcon(state)} ${fit(id, nodeWidth - 2)}`,
            fit(item?.planStep || "pending detail", nodeWidth - 1),
            fit(
              `${item?.owner || "unassigned"} · w${item?.wave || 1}${
                dependencies.length ? ` · ←${dependencies.length}` : ""
              }`,
              nodeWidth - 1,
            ),
          ] as [string, string, string],
        }
      })
      rows.push({ nodes, connectors: [] })
    }
  })

  rows.forEach((row, rowIndex) => {
    const next = rows[rowIndex + 1]
    if (!next) return
    const from = centers(row.nodes.length, { nodeWidth, gap, indent })
    const to = centers(next.nodes.length, { nodeWidth, gap, indent })
    row.connectors = connectorGrid(
      from,
      to,
      graph.items.flatMap((item) =>
        item.dependsOn
          .filter((parent) => itemById.has(parent))
          .map((parent) => ({ from: parent, to: item.id })),
      ),
      slots,
      rowIndex,
      rowIndex + 1,
      width,
    )
  })

  return { rows, nodeWidth, gap }
}

const AGENT_NODE_WIDTH = 24

function agentIcon(state: AgentRunState) {
  return state === "done"
    ? "✓"
    : state === "blocked"
      ? "✗"
      : state === "active"
        ? "●"
        : "○"
}

function agentConnectors(
  fromCount: number,
  toCount: number,
  all = true,
) {
  const options = {
    nodeWidth: AGENT_NODE_WIDTH,
    gap: DEFAULT_GAP,
    indent: DEFAULT_INDENT,
  }
  const from = centers(fromCount, options)
  const to = centers(toCount, options)
  const width = options.indent + Math.max(fromCount, toCount)
    * (AGENT_NODE_WIDTH + DEFAULT_GAP) - DEFAULT_GAP
  const grid = Array.from({ length: 3 }, () => Array.from({ length: width }, () => " "))
  const edges = fromCount === 1
    ? to.map((target) => ({ from: from[0], to: target }))
    : all
      ? from.flatMap((source) => to.map((target) => ({ from: source, to: target })))
      : from.map((source, index) => ({ from: source, to: to[Math.min(index, to.length - 1)] }))

  for (const edge of edges) {
    grid[0][edge.from] = "│"
    grid[1][edge.from] = "│"
    grid[1][edge.to] = "│"
    for (let column = Math.min(edge.from, edge.to); column <= Math.max(edge.from, edge.to); column += 1) {
      if (column !== edge.from && column !== edge.to) grid[1][column] = "─"
    }
    grid[2][edge.to] = "▼"
  }

  return grid.map((line) => line.join("").trimEnd())
}

export function agentGraphView(graph: AgentGraph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const node = (id: string, detail: string): BoardNode => {
    const state = byId.get(id)?.state ?? "idle"
    return {
      id,
      label: id,
      state,
      lines: [
        fit(`${agentIcon(state)} ${id}`, AGENT_NODE_WIDTH - 1),
        fit(detail, AGENT_NODE_WIDTH - 1),
        fit(
          `${byId.get(id)?.dispatches ?? 0} dispatch · ${byId.get(id)?.returns ?? 0} return`,
          AGENT_NODE_WIDTH - 1,
        ),
      ],
    }
  }
  const workers = [
    node("requirements-analyst", "contract"),
    node("information-collector", "evidence"),
    node("coder", "implementation"),
  ]
  const critics = [node("ts-critic", "technical gate"), node("c-critic", "delivery gate")]
  const summary = graph.summary

  return {
    nodeWidth: AGENT_NODE_WIDTH,
    gap: DEFAULT_GAP,
    rows: [
      {
        nodes: [node("aion", `orchestrator · ${summary.dispatches} calls`)],
        connectors: agentConnectors(1, workers.length),
      },
      { nodes: workers, connectors: agentConnectors(workers.length, critics.length) },
      { nodes: critics, connectors: [] },
    ],
    summary: `${summary.done} done · ${summary.blocked} blocked · ${summary.allow} allow · ${summary.reject} reject`,
  }
}
