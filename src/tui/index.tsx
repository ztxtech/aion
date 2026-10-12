import { watch } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { existsSync, readFileSync } from "node:fs"
import { Plugin } from "@opencode/plugin/tui"
import { For, Show, createSignal } from "solid-js"
import type { RGBA } from "@opentui/core"
import {
  buildPlanGraph,
  parsePlanMap,
  type PlanGraph,
} from "../shared/plan-graph"
import {
  EXECUTION_MODES,
  describeExecutionMode,
  formatRuntimeStatus,
  parseExecutionMode,
  readRuntimeState,
  setExecutionMode,
} from "../shared/runtime-control"

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

function mark(state: PlanGraph["items"][number]["state"]) {
  return state === "done" ? "[x]" : state === "in-progress" ? "[~]" : "[ ]"
}

function Board(props: {
  graph: () => PlanGraph
  muted: RGBA
  base: RGBA
  close?: () => void
}) {
  const graph = props.graph
  const done = () =>
    graph().items.filter((item) => item.state === "done").length
  const active = () =>
    graph().items.filter((item) => item.state === "in-progress").length

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      paddingLeft={1}
      paddingRight={1}
      gap={1}
    >
      <box flexDirection="row" flexShrink={0} minWidth={0}>
        <text fg={props.base} wrapMode="none" flexGrow={1}>
          AION DAG
        </text>
        <text fg={props.muted} wrapMode="none" flexShrink={0}>
          {done()}/{graph().items.length} done - {active()} active
        </text>
      </box>

      <Show
        when={graph().items.length > 0}
        fallback={
          <text fg={props.muted} wrapMode="none">
            No AION plan yet. Call aion_todo_update.
          </text>
        }
      >
        <box
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          overflow="hidden"
          gap={1}
        >
          <For each={graph().layers}>
            {(layer, index) => (
              <box flexDirection="column" flexShrink={0} minWidth={0} gap={0}>
                <text fg={props.muted} wrapMode="none">
                  Layer {index() + 1}
                </text>
                <For each={layer}>
                  {(id) => {
                    const item = () =>
                      graph().items.find((candidate) => candidate.id === id)!
                    return (
                      <box
                        flexDirection="column"
                        paddingLeft={2}
                        flexShrink={0}
                        minWidth={0}
                      >
                        <text fg={props.base} wrapMode="none">
                          {mark(item().state)} {item().id} · {item().planStep}
                        </text>
                        <Show when={item().dependsOn.length > 0}>
                          <text
                            fg={props.muted}
                            wrapMode="none"
                            paddingLeft={4}
                          >
                            after {item().dependsOn.join(", ")}
                          </text>
                        </Show>
                      </box>
                    )
                  }}
                </For>
              </box>
            )}
          </For>
        </box>
      </Show>

      <Show when={graph().hasCycle || graph().invalidDependencies.length > 0}>
        <box flexDirection="column" flexShrink={0} minWidth={0}>
          <Show when={graph().hasCycle}>
            <text fg={props.base} wrapMode="none">
              Circular dependencies detected
            </text>
          </Show>
          <Show when={graph().invalidDependencies.length > 0}>
            <text fg={props.muted} wrapMode="none">
              Unknown dependencies: {graph().invalidDependencies.join(", ")}
            </text>
          </Show>
        </box>
      </Show>

      <text fg={props.muted} wrapMode="none" flexShrink={0}>
        <Show when={props.close} fallback="/aion-board">
          esc close
        </Show>
      </text>
    </box>
  )
}

export function watchPlanGraph(root: string = process.cwd()) {
  const [graph, setGraph] = createSignal(readGraph(root))
  const [version, setVersion] = createSignal(0)
  const todoPath = join(root, ".opencode", "memory", "todo-map.md")
  const refresh = () => {
    setGraph(readGraph(root))
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
    version,
    dispose: () => {
      clearTimeout(debounce)
      clearInterval(pollTimer)
      watcher?.close()
    },
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

export default Plugin.define({
  id: "aion-ts-plugin",
  setup(context) {
    const board = watchPlanGraph()
    const { graph } = board

    const openBoard = () => {
      if (context.ui.router.current().type === "session")
        context.ui.panel.open("aion-dag")
      else context.ui.router.navigate({ type: "plugin", name: "aion-dag" })
    }

    const setMode = (input?: string) => {
      const root = projectRoot(context.location)
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
      const root = projectRoot(context.location)
      context.ui.toast.show({
        title: "AION runtime",
        message: formatRuntimeStatus(readRuntimeState(root), activeSessionID(context)),
        variant: "info",
        duration: 9000,
      })
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "aion.board",
          title: "AION board",
          description: "Show the live AION plan DAG",
          group: "AION",
          palette: true,
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

    context.ui.router.register({
      name: "aion-dag",
      render: () => (
        <Board
          graph={graph}
          base={context.theme.text.default}
          muted={context.theme.text.subdued}
        />
      ),
    })

    context.ui.slot({
      append: "session.panel",
      render: (input) =>
        input.name === "aion-dag" ? (
          <Board
            graph={graph}
            base={context.theme.text.default}
            muted={context.theme.text.subdued}
            close={input.close}
          />
        ) : null,
    })

    return board.dispose
  },
})
