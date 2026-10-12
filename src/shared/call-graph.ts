import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export const CALL_GRAPH_FILE = join(".opencode", "memory", "call-graph.json")
export const CALL_GRAPH_VERSION = 1
export const CALL_GRAPH_MAX = 200

export type AgentCallKind = "dispatch" | "return" | "verdict"
export type AgentCallStatus =
  | "dispatched"
  | "done"
  | "blocked"
  | "allow"
  | "reject"

export type AgentCall = {
  from: string
  to: string
  kind: AgentCallKind
  status: AgentCallStatus
  sessionID?: string
  at: string
}

export type CallGraphState = {
  version: typeof CALL_GRAPH_VERSION
  activeSessionID: string | null
  updatedAt: string | null
  calls: AgentCall[]
}

export type AgentRole = "main" | "worker" | "critic"
export type AgentRunState = "idle" | "active" | "done" | "blocked"

export type AgentGraphNode = {
  id: string
  role: AgentRole
  state: AgentRunState
  dispatches: number
  returns: number
}

export type AgentGraphEdge = {
  from: string
  to: string
  kind: AgentCallKind
  count: number
  status: AgentCallStatus
}

export type AgentGraph = {
  nodes: AgentGraphNode[]
  edges: AgentGraphEdge[]
  summary: {
    dispatches: number
    active: number
    done: number
    blocked: number
    allow: number
    reject: number
  }
}

const CALL_STATUSES: readonly AgentCallStatus[] = [
  "dispatched",
  "done",
  "blocked",
  "allow",
  "reject",
]

const CALL_KINDS: readonly AgentCallKind[] = ["dispatch", "return", "verdict"]

const WORKERS = new Set([
  "requirements-analyst",
  "information-collector",
  "coder",
  "search-scout",
  "experiment-runner",
])

const CRITICS = new Set(["ts-critic", "c-critic"])

function emptyState(): CallGraphState {
  return {
    version: CALL_GRAPH_VERSION,
    activeSessionID: null,
    updatedAt: null,
    calls: [],
  }
}

function isAgentCall(value: unknown): value is AgentCall {
  if (!value || typeof value !== "object") return false
  const call = value as Partial<AgentCall>
  return (
    typeof call.from === "string"
    && call.from.length > 0
    && typeof call.to === "string"
    && call.to.length > 0
    && typeof call.kind === "string"
    && (CALL_KINDS as readonly string[]).includes(call.kind)
    && typeof call.status === "string"
    && (CALL_STATUSES as readonly string[]).includes(call.status)
    && typeof call.at === "string"
  )
}

export function callGraphPath(root: string): string {
  return join(root, CALL_GRAPH_FILE)
}

export function readCallGraph(root: string): CallGraphState {
  try {
    const parsed = JSON.parse(readFileSync(callGraphPath(root), "utf8")) as {
      calls?: unknown
      activeSessionID?: unknown
    updatedAt?: unknown
    }
    if (!parsed || !Array.isArray(parsed.calls)) return emptyState()
    return {
      version: CALL_GRAPH_VERSION,
      activeSessionID:
        typeof parsed.activeSessionID === "string" ? parsed.activeSessionID : null,
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      calls: parsed.calls.filter(isAgentCall),
    }
  } catch {
    return emptyState()
  }
}

export function recordAgentCall(
  root: string,
  call: Omit<AgentCall, "at">,
  options: { now?: Date; sessionID?: string | null } = {},
): AgentCall | null {
  try {
    const file = callGraphPath(root)
    const state = readCallGraph(root)
    const item: AgentCall = {
      ...call,
      ...(options.sessionID ? { sessionID: options.sessionID } : {}),
      at: (options.now ?? new Date()).toISOString(),
    }
    const next: CallGraphState = {
      version: CALL_GRAPH_VERSION,
      activeSessionID: options.sessionID ?? state.activeSessionID,
      updatedAt: item.at,
      calls: [...state.calls, item].slice(-CALL_GRAPH_MAX),
    }
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(next))
    renameSync(tmp, file)
    return item
  } catch {
    return null
  }
}

function roleFor(id: string): AgentRole {
  if (id === "aion") return "main"
  if (WORKERS.has(id)) return "worker"
  if (CRITICS.has(id)) return "critic"
  return "worker"
}

function latestMap(calls: AgentCall[], predicate: (call: AgentCall) => boolean) {
  const latest = new Map<string, AgentCall>()
  for (const call of calls) {
    if (predicate(call)) latest.set(call.to, call)
  }
  return latest
}

function completionAfter(
  calls: AgentCall[],
  dispatch: AgentCall,
): AgentCall | undefined {
  return calls.find(
    (call) =>
      call.from === dispatch.to
      && (call.to === "aion" || call.to === dispatch.to)
      && call.kind !== "dispatch"
      && call.at >= dispatch.at
      && (call.status === "done"
        || call.status === "blocked"
        || call.status === "allow"
        || call.status === "reject"),
  )
}

export function buildAgentGraph(state: CallGraphState): AgentGraph {
  const calls = state.calls
  const relevant = calls.filter((call) => call.kind === "dispatch")
  const latestDispatch = latestMap(relevant, () => true)
  const ids = [
    ...new Set([
      "aion",
      ...WORKERS,
      ...CRITICS,
      ...relevant.map((call) => call.to),
    ]),
  ]
  const dispatchCounts = new Map<string, number>()
  for (const call of relevant) {
    dispatchCounts.set(call.to, (dispatchCounts.get(call.to) ?? 0) + 1)
  }

  const nodes: AgentGraphNode[] = ids.map((id) => {
    const dispatch = latestDispatch.get(id)
    const completion = dispatch ? completionAfter(calls, dispatch) : undefined
    const runState: AgentRunState = !dispatch
      ? "idle"
      : completion?.status === "done" || completion?.status === "allow"
        ? "done"
        : completion?.status === "blocked" || completion?.status === "reject"
          ? "blocked"
          : "active"
    const returns = id === "aion"
      ? calls.filter((call) => call.to === "aion" && call.kind !== "dispatch").length
      : calls.filter((call) => call.from === id && call.kind !== "dispatch").length

    return {
      id,
      role: roleFor(id),
      state: runState,
      dispatches: dispatchCounts.get(id) ?? 0,
      returns,
    }
  })
  const downstream = nodes.filter((node) => node.role !== "main")
  const main = nodes.find((node) => node.id === "aion")
  if (main) {
    main.state = downstream.some((node) => node.state === "active")
      ? "active"
      : downstream.some((node) => node.state === "blocked")
        ? "blocked"
        : downstream.every((node) => node.state === "done") && downstream.some((node) => node.dispatches > 0)
          ? "done"
          : "idle"
  }

  const edgeMap = new Map<string, AgentGraphEdge>()
  for (const call of calls) {
    const key = `${call.from}\0${call.to}\0${call.kind}`
    const current = edgeMap.get(key)
    if (current) {
      current.count += 1
      current.status = call.status
    } else {
      edgeMap.set(key, { ...call, count: 1 })
    }
  }

  const edges = [...edgeMap.values()].sort((left, right) =>
    `${left.from}${left.to}${left.kind}`.localeCompare(
      `${right.from}${right.to}${right.kind}`,
    ),
  )
  const byState = (role: AgentRole, state: AgentRunState) =>
    nodes.filter((node) => node.role === role && node.state === state).length

  return {
    nodes,
    edges,
    summary: {
      dispatches: relevant.length,
      active: byState("worker", "active") + byState("critic", "active"),
      done: byState("worker", "done") + byState("critic", "done"),
      blocked: byState("worker", "blocked") + byState("critic", "blocked"),
      allow: calls.filter(
        (call) => call.kind === "verdict" && call.status === "allow",
      ).length,
      reject: calls.filter(
        (call) => call.kind === "verdict" && call.status === "reject",
      ).length,
    },
  }
}
