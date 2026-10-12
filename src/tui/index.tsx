import { watch } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { Plugin } from "@opencode/plugin/tui"
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js"
import type { RGBA } from "@opentui/core"
import {
  buildPlanGraph,
  parsePlanMap,
  type PlanGraph,
} from "../shared/plan-graph"
import {
  agentActivityView,
  agentListLine,
  boardStateIcon,
  executionListItems,
  executionListLine,
  type BoardListItem,
} from "../shared/board-view"
import { buildAgentGraph, readCallGraph, type CallGraphState } from "../shared/call-graph"
import {
  EXECUTION_MODES,
  describeExecutionMode,
  formatRuntimeStatus,
  parseExecutionMode,
  readRuntimeState,
  sessionRuntimeState,
  setExecutionMode,
} from "../shared/runtime-control"
import {
  initialToastCursor,
  readToastQueue,
  toastsAfter,
  type QueuedToast,
} from "../shared/toast-queue"

const AION_STATUS_HINT = "ctrl+g AION board · ctrl+p commands"
const ZTXTECH_LOGO_TEXT = "ZTXTECH"
const ZTXTECH_LOGO_FONT = "tiny"

type BoardPalette = {
  base: RGBA
  muted: RGBA
  accent: RGBA
  active: RGBA
  success: RGBA
  warning: RGBA
  danger: RGBA
  surface: RGBA
  border: RGBA
}

type RuntimeSnapshot = {
  mode: string
  tier: string
  phase: string
  interrupted: boolean
  resumeHint: string | null
}

function readGraph(root: string): PlanGraph {
  try {
    const content = readFileSync(
      join(root, ".opencode", "memory", "todo-map.md"),
      "utf8",
    )
    return buildPlanGraph(parsePlanMap(content))
  } catch {
    return { items: [], layers: [], invalidDependencies: [], hasCycle: false }
  }
}

function readBlockers(root: string): string[] {
  try {
    const content = readFileSync(
      join(root, ".opencode", "memory", "todo-map.md"),
      "utf8",
    )
    const section = content
      .split(/^##\s+Current Blockers\s*$/m)[1]
      ?.split(/^##\s+/m)[0] ?? ""
    return section
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- ") && line !== "- (none)")
      .map((line) => line.slice(2))
  } catch {
    return []
  }
}

function readRuntimeSnapshot(
  root: string,
  sessionID?: string | null,
): RuntimeSnapshot {
  const state = readRuntimeState(root)
  const session = sessionRuntimeState(state, sessionID ?? state.activeSessionID)
  return {
    mode: state.executionMode,
    tier: session?.complexityTier ?? "unset",
    phase: session?.lastPhase ?? "init",
    interrupted: session?.interrupted ?? false,
    resumeHint: session?.resumeHint,
  }
}

function Board(props: {
  graph: () => PlanGraph
  callGraph: () => CallGraphState
  blockers: () => string[]
  runtime: () => RuntimeSnapshot
  sessionID: () => string | null
  palette: BoardPalette
  close?: () => void
}) {
  const graph = props.graph
  const runtime = createMemo(() => props.runtime())
  const sessionID = createMemo(() => props.sessionID())
  const done = () => graph().items.filter((item) => item.state === "done").length
  const active = () =>
    graph().items.filter((item) => item.state === "in-progress").length
  const progress = () => {
    const total = graph().items.length
    const width = 12
    if (total === 0) return `${"░".repeat(width)} 0%`
    const filled = Math.min(width, Math.max(1, Math.round((done() / total) * width)))
    const percent = Math.round((done() / total) * 100)
    return `${"█".repeat(filled)}${"░".repeat(width - filled)} ${percent}%`
  }
  const focusItem = () =>
    graph().items.find((item) => item.state === "in-progress") ??
    graph().items.find((item) => item.state === "todo") ??
    graph().items[0]
  const [tick, setTick] = createSignal(0)
  const timer = setInterval(() => setTick((value) => value + 1), 280)

  onCleanup(() => {
    clearInterval(timer)
  })
  const executionItems = createMemo(() => executionListItems(graph()))
  const agentBoard = createMemo(() =>
    agentActivityView(buildAgentGraph(props.callGraph())),
  )

  const itemColor = (item: BoardListItem) =>
    item.state === "done"
      ? props.palette.success
      : item.state === "active"
        ? props.palette.active
        : item.state === "blocked"
          ? props.palette.danger
          : item.state === "todo"
            ? props.palette.accent
            : props.palette.muted

  return (
    <box
      flexDirection="column"
      height="100%"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      backgroundColor={props.palette.surface}
      paddingLeft={1}
      paddingRight={1}
      paddingTop={1}
      gap={1}
    >
      <box
        flexDirection="column"
        flexShrink={0}
        borderStyle="rounded"
        borderColor={props.palette.accent}
        backgroundColor={props.palette.surface}
        title=" AION CONTROL "
        titleAlignment="left"
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexDirection="row" gap={3} flexShrink={0} minWidth={0}>
          <box flexDirection="column" gap={1} flexGrow={1} minWidth={0}>
            <text fg={props.palette.base} wrapMode="none">
              {progress()}
            </text>
            <box flexDirection="row" gap={1} flexShrink={0} minWidth={0}>
              <text fg={props.palette.muted} wrapMode="none">
                MODE
              </text>
              <text fg={props.palette.base} wrapMode="none" flexGrow={1}>
                {runtime().mode}
              </text>
            </box>
            <box flexDirection="row" gap={1} flexShrink={0} minWidth={0}>
              <text fg={props.palette.muted} wrapMode="none">
                PHASE
              </text>
              <text
                fg={runtime().interrupted ? props.palette.warning : props.palette.base}
                wrapMode="none"
                flexGrow={1}
              >
                {runtime().phase}
                {runtime().interrupted ? " - resume" : ""}
              </text>
            </box>
            <box flexDirection="row" gap={1} flexShrink={0} minWidth={0}>
              <text fg={props.palette.muted} wrapMode="none">
                TIER
              </text>
              <text fg={props.palette.base} wrapMode="none" flexGrow={1}>
                {runtime().tier}
              </text>
            </box>
          </box>
          <box
            flexDirection="column"
            flexShrink={0}
            marginTop={1}
            minWidth={22}
            minHeight={2}
            alignItems="center"
            justifyContent="center"
          >
            <ascii_font
              text={ZTXTECH_LOGO_TEXT}
              font={ZTXTECH_LOGO_FONT}
              color={props.palette.accent}
              selectable={false}
            />
          </box>
        </box>
      </box>

      <box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        minWidth={0}
        paddingLeft={1}
        paddingRight={1}
      >
        <text fg={props.palette.success} wrapMode="none">
          {done()} done
        </text>
        <text fg={props.palette.active} wrapMode="none">
          {active()} active
        </text>
        <text fg={props.palette.muted} wrapMode="none" flexGrow={1}>
          {graph().items.length - done() - active()} queued
        </text>
      </box>

      <scrollbox
        scrollY
        viewportCulling={false}
        height="auto"
        flexGrow={1}
        flexShrink={1}
        minHeight={8}
        minWidth={0}
        gap={1}
        backgroundColor={props.palette.surface}
      >
        <Show
          when={graph().items.length > 0}
          fallback={
            <box
              flexShrink={0}
              borderStyle="rounded"
              borderColor={props.palette.border}
              title=" EXECUTION PLAN "
              titleAlignment="left"
              paddingLeft={1}
            >
              <text fg={props.palette.muted} wrapMode="none">
                Waiting for aion_todo_update
              </text>
            </box>
          }
        >
          <box
            flexDirection="column"
            flexShrink={0}
            borderStyle="rounded"
            borderColor={props.palette.border}
            title=" EXECUTION PLAN "
            titleAlignment="left"
            paddingLeft={1}
            paddingRight={1}
          >
            <For each={executionItems()}>
              {(item) => (
                <text fg={itemColor(item)} wrapMode="word">
                  {executionListLine(item, tick())}
                </text>
              )}
            </For>
          </box>
        </Show>

        <Show when={agentBoard().items.length > 0}>
          <box
            flexDirection="column"
            flexShrink={0}
            borderStyle="rounded"
            borderColor={props.palette.accent}
            title=" AGENT ACTIVITY "
            titleAlignment="left"
            paddingLeft={1}
            paddingRight={1}
          >
            <For each={agentBoard().items}>
              {(item) => (
                <text fg={itemColor(item)} wrapMode="word">
                  {agentListLine(item, tick())}
                </text>
              )}
            </For>
            <text fg={props.palette.muted} wrapMode="none">
              {agentBoard().summary}
            </text>
          </box>
        </Show>

        <Show
          when={
            graph().hasCycle ||
            graph().invalidDependencies.length > 0 ||
            props.blockers().length > 0
          }
        >
          <box flexDirection="column" flexShrink={0} minWidth={0}>
            <Show when={graph().hasCycle}>
              <text fg={props.palette.danger} wrapMode="none">
                Circular dependencies detected
              </text>
            </Show>
            <Show when={graph().invalidDependencies.length > 0}>
              <text fg={props.palette.warning} wrapMode="none">
                Unknown dependencies: {graph().invalidDependencies.join(", ")}
              </text>
            </Show>
            <Show when={props.blockers().length > 0}>
              <text fg={props.palette.danger} wrapMode="none">
                Blockers: {props.blockers().length}
              </text>
            </Show>
          </box>
        </Show>
      </scrollbox>

      <Show when={focusItem()}>
        {(item) => (
          <box
            flexDirection="column"
            flexShrink={0}
            borderStyle="rounded"
            borderColor={props.palette.accent}
            title=" CURRENT FOCUS "
            titleAlignment="left"
            paddingLeft={1}
            paddingRight={1}
          >
            <text fg={props.palette.base} wrapMode="none">
              {item().id} {item().planStep}
            </text>
            <Show when={item().compareGate}>
              <text fg={props.palette.muted} wrapMode="none">
                gate {item().compareGate}
              </text>
            </Show>
            <Show when={item().rollbackRule}>
              <text fg={props.palette.muted} wrapMode="none">
                rollback {item().rollbackRule}
              </text>
            </Show>
          </box>
        )}
      </Show>

      <text
        fg={props.palette.muted}
        wrapMode="none"
        flexShrink={0}
      >
        <Show when={props.close} fallback="ctrl+g close · /aion-mode · /aion-status">
          ctrl+g close · /aion-mode · /aion-status
        </Show>
      </text>
    </box>
  )
}

function Summary(props: {
  graph: () => PlanGraph
  runtime: () => RuntimeSnapshot
  blockers: () => string[]
  palette: BoardPalette
}) {
  const done = () =>
    props.graph().items.filter((item) => item.state === "done").length
  const total = () => props.graph().items.length
  const percent = () =>
    total() === 0 ? 0 : Math.round((done() / total()) * 100)
  const focus = () =>
    props.graph().items.find((item) => item.state === "in-progress") ??
    props.graph().items.find((item) => item.state === "todo")

  return (
    <Show when={total() > 0}>
      <box flexDirection="column" flexShrink={0} minWidth={0} gap={1}>
        <text fg={props.palette.accent} wrapMode="none">
          AION · {props.runtime().mode.toUpperCase()} · {percent()}%
        </text>
        <text fg={props.palette.muted} wrapMode="none">
          {done()}/{total()} done · {props.runtime().phase} · {props.runtime().tier}
        </text>
        <Show when={focus()}>
          {(item) => (
            <text fg={stateColorFor(props.palette, item().state)} wrapMode="none">
              {boardStateIcon(item().state)} {item().id} {item().planStep}
            </text>
          )}
        </Show>
        <Show when={props.blockers().length > 0}>
          <text fg={props.palette.danger} wrapMode="none">
            blockers {props.blockers().length}
          </text>
        </Show>
      </box>
    </Show>
  )
}

function stateColorFor(
  palette: BoardPalette,
  state: PlanGraph["items"][number]["state"],
) {
  return state === "done"
    ? palette.success
    : state === "in-progress"
      ? palette.active
      : palette.muted
}

export function watchPlanGraph(root: string = process.cwd()) {
  const [graph, setGraph] = createSignal(readGraph(root))
  const [blockers, setBlockers] = createSignal(readBlockers(root))
  const [version, setVersion] = createSignal(0)
  const todoPath = join(root, ".opencode", "memory", "todo-map.md")
  const refresh = () => {
    setGraph(readGraph(root))
    setBlockers(readBlockers(root))
    setVersion((count) => count + 1)
  }
  let watcher: ReturnType<typeof watch> | undefined
  let debounce: ReturnType<typeof setTimeout> | undefined
  const pollTimer = setInterval(refresh, 500)
  pollTimer.unref?.()

  const armWatcher = () => {
    watcher?.close()
    watcher = undefined

    let directory = dirname(todoPath)
    while (!existsSync(directory) && dirname(directory) !== directory)
      directory = dirname(directory)

    try {
      watcher = watch(directory, (_, filename) => {
        if (!filename) {
          if (directory !== dirname(todoPath)) armWatcher()
          return
        }

        const changedPath = resolve(directory, filename.toString())
        if (changedPath === todoPath) {
          clearTimeout(debounce)
          debounce = setTimeout(refresh, 50)
        } else if (directory !== dirname(todoPath)) {
          armWatcher()
        }
      })
      watcher.on("error", () => watcher?.close())
      watcher.unref?.()
    } catch {
      watcher = undefined
    }
  }

  armWatcher()

  return {
    graph,
    blockers,
    version,
    dispose: () => {
      clearTimeout(debounce)
      clearInterval(pollTimer)
      watcher?.close()
    },
  }
}

export function watchCallGraph(
  root: string = process.cwd(),
  getSessionID: () => string | null = () => null,
) {
  const [callGraph, setCallGraph] = createSignal(readCallGraph(root))
  const pollTimer = setInterval(
    () => {
      const state = readCallGraph(root)
      const sessionID = getSessionID()
      setCallGraph(
        !sessionID
          ? state
        : {
              ...state,
              activeSessionID: sessionID,
              calls: state.calls.filter(
                (call) => !call.sessionID || call.sessionID === sessionID,
              ),
            },
      )
    },
    500,
  )
  pollTimer.unref?.()

  return {
    callGraph,
    dispose: () => clearInterval(pollTimer),
  }
}

export function watchRuntimeSnapshot(
  root: string = process.cwd(),
  getSessionID: () => string | null = () => null,
) {
  const [version, setVersion] = createSignal(0)
  const runtime = createMemo(() => {
    version()
    return readRuntimeSnapshot(root, getSessionID())
  })
  const pollTimer = setInterval(() => setVersion((count) => count + 1), 500)
  pollTimer.unref?.()

  return {
    runtime,
    dispose: () => clearInterval(pollTimer),
  }
}

/**
 * Server -> TUI toast bridge consumer. The server plugin cannot reach the
 * TUI runtime on OpenCode V2, so it appends toasts (diagnostics, personality
 * quips) to a disk queue; this watcher delivers each new item exactly once.
 *
 * The initial cursor skips stale backlog (a TUI restart must not replay old
 * toasts) while keeping items written within the grace window, so the boot
 * entrance quip survives the race between server setup and TUI setup.
 */
export function watchToasts(
  root: string = process.cwd(),
  show: (toast: QueuedToast) => void,
  options: { pollMs?: number; graceMs?: number; now?: number } = {},
) {
  let cursor = initialToastCursor(readToastQueue(root), {
    now: options.now,
    graceMs: options.graceMs,
  })

  const poll = () => {
    const queue = readToastQueue(root)
    for (const toast of toastsAfter(queue, cursor)) {
      cursor = toast.id
      try {
        show(toast)
      } catch {
        /* a bad toast must never break the watcher */
      }
    }
  }

  const pollTimer = setInterval(poll, options.pollMs ?? 500)
  pollTimer.unref?.()

  return {
    cursor: () => cursor,
    poll,
    dispose: () => clearInterval(pollTimer),
  }
}

export function projectRoot(location?: { directory?: string }): string {
  return location?.directory ?? process.cwd()
}

export function activeSessionID(context: {
  ui: {
    panel: { current(): { sessionID: string } | undefined }
    router: { current(): { type: string; sessionID?: string } }
  }
}): string | null {
  const route = context.ui.router.current()
  return route.type === "session" && route.sessionID
    ? route.sessionID
    : context.ui.panel.current()?.sessionID ?? null
}

export function shouldAutoOpen(input: {
  hasPlan: boolean
  routeType: string
  armed: boolean
  panelOpen: boolean
}) {
  return input.hasPlan && input.routeType === "session" && input.armed && !input.panelOpen
}

export default Plugin.define({
  id: "aion-ts-plugin",
  setup(context) {
    const root = projectRoot(context.location)
    const board = watchPlanGraph(root)
    const calls = watchCallGraph(root, () => activeSessionID(context))
    const runtimeBoard = watchRuntimeSnapshot(root, () => activeSessionID(context))
    const toasts = watchToasts(root, (toast) => {
      context.ui.toast.show({
        title: toast.title,
        message: toast.message,
        variant: toast.variant,
        duration: toast.duration,
      })
    })
    const { graph, blockers } = board
    const { callGraph } = calls
    const { runtime } = runtimeBoard
    let autoOpenArmed = true

    const openBoard = () => {
      if (context.ui.panel.current()?.name === "aion-dag") {
        context.ui.panel.close()
        return
      }
      if (context.ui.router.current().type === "session")
        context.ui.panel.open("aion-dag")
      else context.ui.router.navigate({ type: "plugin", name: "aion-dag" })
    }

    createEffect(() => {
      const route = context.ui.router.current()
      const hasPlan = graph().items.length > 0
      const panelOpen = Boolean(context.ui.panel.current())

      if (!hasPlan) {
        autoOpenArmed = true
        return
      }
      if (!shouldAutoOpen({ hasPlan, routeType: route.type, armed: autoOpenArmed, panelOpen })) return

      autoOpenArmed = false
      context.ui.panel.open("aion-dag")
    })

    const setMode = (input?: string) => {
      const mode = parseExecutionMode(input ?? "")
      if (!mode) {
        context.ui.toast.show({
          title: "AION mode",
          message: `Usage: /aion-mode ${EXECUTION_MODES.join("|").toLowerCase()}`,
          variant: "warning",
          duration: 6000,
        })
        return
      }

      const state = setExecutionMode(root, mode)
      context.ui.toast.show({
        title: `AION mode: ${state.executionMode}`,
        message: describeExecutionMode(state.executionMode),
        variant: "success",
        duration: 6000,
      })
    }

    const showStatus = () => {
      context.ui.toast.show({
        title: "AION runtime",
        message: formatRuntimeStatus(readRuntimeState(root), activeSessionID(context)),
        variant: "info",
        duration: 9000,
      })
    }

    const palette: BoardPalette = {
      base: context.theme.text.base,
      muted: context.theme.text.muted,
      accent: context.theme.hue.accent[400],
      active: context.theme.hue.interactive[300],
      success: context.theme.text.feedback.success.base,
      warning: context.theme.text.feedback.warning.base,
      danger: context.theme.text.feedback.error.base,
      surface: context.theme.background.raised.base,
      border: context.theme.border.base,
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "aion.board",
          title: "AION board",
          description: "Toggle the live AION plan DAG",
          group: "AION",
          bind: "ctrl+g",
          palette: true,
          suggested: true,
          slash: { name: "aion-board" },
          run: openBoard,
        },
        {
          id: "aion.mode",
          title: "AION mode",
          description: "Set auto, light, medium, full, or max execution",
          group: "AION",
          palette: true,
          slash: { name: "aion-mode", arguments: true },
          run: setMode,
        },
        {
          id: "aion.status",
          title: "AION status",
          description: "Show execution mode and resume state",
          group: "AION",
          palette: true,
          slash: { name: "aion-status" },
          run: showStatus,
        },
      ],
    }))

    const disposeRoute = context.ui.router.register({
      name: "aion-dag",
      render: () => (
        <Board
          graph={graph}
          callGraph={callGraph}
          blockers={blockers}
          runtime={runtime}
          sessionID={() => activeSessionID(context)}
          palette={palette}
        />
      ),
    })

    const disposeSlot = context.ui.slot({
      append: "session.panel",
      render: (input) =>
        input.name === "aion-dag" ? (
          <Board
            graph={graph}
            callGraph={callGraph}
            blockers={blockers}
            runtime={runtime}
            sessionID={() => activeSessionID(context)}
            palette={palette}
            close={input.close}
          />
        ) : null,
    })

    const disposeSidebar = context.ui.slot({
      append: "sidebar.content",
      render: () => (
        <Summary
          graph={graph}
          runtime={runtime}
          blockers={blockers}
          palette={palette}
        />
      ),
    })

    const disposeHint = context.ui.slot({
      append: "prompt.footer.status",
      render: () => (
        <text fg={context.theme.text.muted} wrapMode="none">
          {AION_STATUS_HINT}
        </text>
      ),
    })

    return () => {
      disposeHint()
      disposeSidebar()
      disposeSlot()
      disposeRoute()
      toasts.dispose()
      board.dispose()
      calls.dispose()
      runtimeBoard.dispose()
    }
  },
})

export {
  AION_STATUS_HINT,
  ZTXTECH_LOGO_FONT,
  ZTXTECH_LOGO_TEXT,
  agentListLine,
  executionListLine,
}
