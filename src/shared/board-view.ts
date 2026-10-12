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
  active: boolean
}

export type ExecutionBoard = {
  rows: BoardRow[]
  nodeWidth: number
  gap: number
}

export const AION_LOGO = [
  "█▀▄▀█ █ █▀█ █▀█",
  "█▀▀▀█ █ █▀▄ █▀▄",
] as const

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
  const grid = Array.from({ length: 3 }, () => Array.from({ length: width }, () => 0))
  const targets = new Set<number>()
  const glyphs: Record<number, string> = {
    1: "│",
    2: "─",
    3: "└",
    4: "│",
    5: "│",
    6: "┌",
    7: "├",
    8: "─",
    9: "┘",
    10: "─",
    11: "┴",
    12: "┐",
    13: "┤",
    14: "┬",
    15: "┼",
  }

  for (const edge of edges) {
    const source = slots.get(edge.from)
    const target = slots.get(edge.to)
    if (!source || !target) continue
    if (source.row !== fromRow || target.row !== toRow) continue

    const a = from[source.index] ?? from[0] ?? 0
    const b = to[target.index] ?? to[0] ?? a
    grid[0][a] |= 5
    grid[1][a] |= 1
    if (a < b) {
      for (let column = a; column < b; column += 1) {
        grid[1][column] |= 2
        grid[1][column + 1] |= 8
      }
    }
    if (a > b) {
      for (let column = b; column < a; column += 1) {
        grid[1][column] |= 2
        grid[1][column + 1] |= 8
      }
    }
    grid[1][b] |= 4
    if (b >= 0 && b < width) targets.add(b)
  }

  return grid.map((line, lineIndex) =>
    line
      .map((bits, column) =>
        lineIndex === 2 && targets.has(column) ? "▼" : glyphs[bits] ?? " ",
      )
      .join("")
      .trimEnd(),
  )
}

const FLOW_FRAMES = ["◆", "◇", "·", "◇"]

export function animateConnectors(lines: string[], tick: number): string[] {
  return lines.map((line, lineIndex) => {
    if (lineIndex !== 1) return line
    let segmentStart = -1
    const characters = [...line]
    for (let index = 0; index <= characters.length; index += 1) {
      const isLine = characters[index] === "─"
      if (isLine && segmentStart < 0) segmentStart = index
      if (isLine) continue
      if (segmentStart < 0) continue

      const length = index - segmentStart
      const position = segmentStart + ((tick % length) + length) % length
      characters[position] = FLOW_FRAMES[tick % FLOW_FRAMES.length]
      segmentStart = -1
    }
    return characters.join("").trimEnd()
  })
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
  options: LayoutOptions & { tick?: number } = {},
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
      rows.push({ nodes, connectors: [], active: nodes.some((node) => node.state === "active") })
    }
  })

  rows.forEach((row, rowIndex) => {
    const next = rows[rowIndex + 1]
    if (!next) return
    const from = centers(row.nodes.length, { nodeWidth, gap, indent })
    const to = centers(next.nodes.length, { nodeWidth, gap, indent })
    row.connectors = animateConnectors(
        connectorGrid(
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
        ),
      options.tick ?? 0,
    )
    row.active = row.active || next.active
  })

  return { rows, nodeWidth, gap }
}

const AGENT_NODE_WIDTH = 13

function agentIcon(state: AgentRunState) {
  return state === "done"
    ? "✓"
    : state === "blocked"
      ? "✗"
      : state === "active"
        ? "●"
        : "○"
}

export function agentGraphView(
  graph: AgentGraph,
  options: { columns?: number; tick?: number } = {},
) {
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
          `${byId.get(id)?.dispatches ?? 0}↑ · ${byId.get(id)?.returns ?? 0}↓`,
          AGENT_NODE_WIDTH - 1,
        ),
      ],
    }
  }
  const agents = [
    node("requirements-analyst", "contract"),
    node("information-collector", "evidence"),
    node("coder", "build"),
    node("ts-critic", "technical"),
    node("c-critic", "delivery"),
  ]
  const summary = graph.summary
  const columns = options.columns ?? 92
  const gap = DEFAULT_GAP
  const indent = DEFAULT_INDENT
  const perRow = Math.max(
    1,
    Math.floor((columns - indent + gap) / (AGENT_NODE_WIDTH + gap)),
  )
  const width = indent + perRow * (AGENT_NODE_WIDTH + gap) - gap
  const slots = new Map<string, { row: number; index: number }>()
  const rows: BoardRow[] = [
    {
      nodes: [node("aion", "orchestrator")],
      connectors: [],
      active: byId.get("aion")?.state === "active",
    },
  ]
  slots.set("aion", { row: 0, index: 0 })

  for (const group of chunk(agents, perRow)) {
    const rowIndex = rows.length
    const nodes = group.map((agent, index) => {
      slots.set(agent.id, { row: rowIndex, index })
      return agent
    })
    rows.push({ nodes, connectors: [], active: nodes.some((node) => node.state === "active") })
  }

  rows.forEach((row, rowIndex) => {
    const next = rows[rowIndex + 1]
    if (!next) return
    const from = centers(row.nodes.length, {
      nodeWidth: AGENT_NODE_WIDTH,
      gap,
      indent,
    })
    const to = centers(next.nodes.length, {
      nodeWidth: AGENT_NODE_WIDTH,
      gap,
      indent,
    })
    const edges = graph.nodes
      .filter((candidate) => candidate.id !== "aion")
      .map((candidate) => ({ from: "aion", to: candidate.id }))
    row.connectors = animateConnectors(
      connectorGrid(from, to, edges, slots, rowIndex, rowIndex + 1, width),
      options.tick ?? 0,
    )
    row.active = row.active || next.active
  })

  return {
    rows,
    nodeWidth: AGENT_NODE_WIDTH,
    gap,
    summary: `${summary.done} done · ${summary.blocked} blocked · ${summary.allow} allow · ${summary.reject} reject`,
  }
}
