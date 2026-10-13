/**
 * AION OpenCode V2 plugin.
 *
 * Setup owns the complete lifecycle: config/bootstrap, managers, native V2
 * registrations, and cleanup. There is intentionally no V1 server-object
 * translation layer.
 */
import { Plugin } from "@opencode/plugin"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { loadAionConfig } from "./config/load-config"
import { createAionManagers } from "./create-managers"
import { createAllAionTools } from "./create-tools"
import { createAionHooks } from "./create-hooks"
import { bootstrapWorkspace } from "./workspace-bootstrap"
import { buildAionAgents } from "./agents/registry"
import { isAionAgent } from "./agents/scope"
import { createPersonality, DEFAULT_PERSONALITY_CONFIG, type PersonalityConfig } from "./hooks/personality"
import { info } from "./shared/logger"
import type { AionConfig } from "./config/types"

const managedAgentMarker = "<!-- aion-plugin:managed -->"

type PermissionEvaluation = {
  action: string
  resources: readonly string[]
  effect: "allow" | "ask" | "deny"
  message?: string
  source?: { id?: string }
}

function permissionRules(permission?: Record<string, "allow" | "deny" | "ask">) {
  const actionMap: Record<string, string> = {
    bash: "shell",
    task: "subagent",
    write: "edit",
    patch: "edit",
  }

  return Object.entries(permission ?? {}).map(([action, effect]) => ({
    action: actionMap[action] ?? action,
    resource: "*",
    effect,
  }))
}

function yamlValue(value: unknown) {
  return JSON.stringify(value)
}

function managedAgentFrontmatter(config: Record<string, any>) {
  const rules = [
    { action: "aion", resource: "*", effect: "allow" },
    { action: "subagent", resource: "*", effect: "allow" },
    ...permissionRules(config.permission),
  ]

  return [
    "---",
    `description: ${yamlValue(config.description ?? "")}`,
    `mode: ${yamlValue(config.mode ?? "subagent")}`,
    ...(config.model ? [`model: ${yamlValue(config.model)}`] : []),
    "permissions:",
    ...rules.map((rule) =>
      `  - { action: ${yamlValue(rule.action)}, resource: ${yamlValue(rule.resource)}, effect: ${yamlValue(rule.effect)} }`,
    ),
    ...(config.temperature !== undefined || config.topP !== undefined || config.options
      ? [
          "request:",
          "  body:",
          ...(config.temperature !== undefined ? [`    temperature: ${config.temperature}`] : []),
          ...(config.topP !== undefined ? [`    top_p: ${config.topP}`] : []),
          ...Object.entries(config.options ?? {}).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`),
        ]
      : []),
    "---",
  ].join("\n")
}

function writeManagedAgent(directory: string, name: string, config: Record<string, any>) {
  const agentDir = join(directory, ".opencode", "agents")
  const agentPath = join(agentDir, `${name}.md`)

  if (existsSync(agentPath)) {
    const content = readFileSync(agentPath, "utf8")
    if (!content.includes(managedAgentMarker)) return
  }

  mkdirSync(agentDir, { recursive: true })
  const system = Array.isArray(config.prompt) ? config.prompt.join("\n") : config.prompt ?? ""
  writeFileSync(
    agentPath,
    `${managedAgentFrontmatter(config)}\n\n${managedAgentMarker}\n\n${system}\n`,
  )
}

function resultText(result: unknown) {
  const content = (result as { content?: unknown } | undefined)?.content
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
      .filter(Boolean)
      .join("\n")
  }
  return undefined
}

function evaluateAionPermission(event: PermissionEvaluation, config: AionConfig) {
  const toolId = event.source?.id ?? event.resources[0] ?? ""
  const autonomous = config.interactiveMode?.granularity !== "always-interactive"

  if (event.action === "aion") {
    event.effect = "allow"
    event.message = "AION internal state tools do not require an external permission prompt."
    return
  }

  if (autonomous && (event.action === "shell" || event.action === "webfetch" || event.action === "websearch")) {
    event.effect = "allow"
    info("[aion] permission.evaluate: autonomous tool allowed", {
      action: event.action,
      resource: event.resources[0] ?? "",
      tool: toolId,
    })
  }
}

const aionPlugin = Plugin.define({
  id: "aion-ts-plugin",
  async setup(context) {
    const directory = context.location.directory
    info("[aion] plugin setup started", { directory })

    const config = await loadAionConfig(directory, { directory, options: context.options })
    bootstrapWorkspace(directory, config)
    const client = (context as { client?: unknown }).client

    const personalityConfig: PersonalityConfig = {
      ...DEFAULT_PERSONALITY_CONFIG,
      ...(config.personality ?? {}),
    }
    const personality = createPersonality({ client, directory, config: personalityConfig })
    const managers = createAionManagers({
      ctx: { directory, client, options: context.options },
      config,
      onPhaseChange: (_previous, next) => personality.onPhaseTransition(next),
    })
    const tools = createAllAionTools({ ctx: { directory, client, options: context.options }, config, managers })
    const aionToolIds = new Set(Object.keys(tools))
    const hooks = createAionHooks({ ctx: { directory, client, options: context.options }, config, managers, personality })
    const registrations: Array<{ dispose: () => Promise<void> }> = []

    for (const [name, agent] of Object.entries(buildAionAgents({}))) {
      writeManagedAgent(directory, name, agent)
    }
    await context.agent.reload()
    registrations.push(await context.agent.transform((editor) => {
      if (config.defaultAgent) editor.default(config.defaultAgent as Parameters<typeof editor.default>[0])
    }))

    registrations.push(await context.tool.transform((editor) => {
      for (const tool of Object.values(tools)) editor.add(tool)
    }))

    if (hooks["tool.execute.before"]) {
      const hook = hooks["tool.execute.before"]
      registrations.push(await context.tool.hook("execute.before", async (event) => {
        if (event.agent !== undefined && !isAionAgent(event.agent)) return
        const output = { args: event.input as Record<string, unknown>, metadata: {} }
        await hook({ tool: event.tool, sessionID: event.sessionID, callID: event.id, agent: event.agent }, output)
        if (output.args) event.input = output.args
      }))
    }

    if (hooks["tool.execute.after"]) {
      const hook = hooks["tool.execute.after"]
      registrations.push(await context.tool.hook("execute.after", async (event) => {
        if (event.agent !== undefined && !isAionAgent(event.agent)) return
        if (event.status !== "completed") return
        await hook(
          { tool: event.tool, sessionID: event.sessionID, callID: event.id, agent: event.agent },
          { args: event.input as Record<string, unknown>, output: resultText(event.result), metadata: {} },
        )
      }))
    }

    registrations.push(await context.permission.hook("evaluate", async (event) => {
      try {
        if (event.agent !== undefined && !isAionAgent(event.agent)) return
        evaluateAionPermission(event, config)
      } catch (error) {
        console.warn("[aion] permission.evaluate error", error)
      }
    }))

    if (hooks["chat.message"]) {
      const hook = hooks["chat.message"]
      registrations.push(await context.session.hook("prompt", async (event) => {
        const session = await context.session.get({ sessionID: event.sessionID }).catch(() => undefined)
        const activeAgent = session?.agent ?? config.defaultAgent ?? "aion"
        if (!isAionAgent(activeAgent)) return

        await hook({
          sessionID: event.sessionID,
          messageID: event.messageID,
          agent: activeAgent,
          model: { providerID: "", modelID: "" },
        }, {
          message: {
            id: event.messageID,
            sessionID: event.sessionID,
            role: "user",
            agent: activeAgent,
            model: { providerID: "", modelID: "" },
          },
          parts: [{ type: "text", text: event.prompt.text }],
        })
      }))
    }

    registrations.push(await context.session.hook("context", async (event) => {
      if (!isAionAgent(event.agent)) {
        for (const id of aionToolIds) delete event.tools[id]
        return
      }

      if (hooks["chat.params"]) {
        const output = {
          temperature: undefined,
          topP: undefined,
          topK: undefined,
          maxOutputTokens: undefined,
          options: {},
        }
        await hooks["chat.params"]({
          sessionID: event.sessionID,
          agent: event.agent,
          model: event.model,
          provider: { id: "aion" },
        }, output)
        if (output.temperature !== undefined) event.options.temperature = output.temperature
        if (output.topP !== undefined) event.options.topP = output.topP
        if (output.topK !== undefined) event.options.topK = output.topK
        if (output.maxOutputTokens !== undefined) event.options.maxTokens = output.maxOutputTokens
        Object.assign(event.options, output.options)
      }

      if (hooks["experimental.chat.system.transform"]) {
        const output = { system: event.system.map((part) => part.text ?? "") }
        await hooks["experimental.chat.system.transform"](
          { sessionID: event.sessionID, agent: event.agent, model: event.model },
          output,
        )
        event.system = output.system.map((text) => ({ type: "text" as const, text }))
      }
    }))

    if (hooks["experimental.session.compacting"]) {
      const hook = hooks["experimental.session.compacting"]
      registrations.push(await context.session.hook("context", async (event) => {
        const requestKind = (event as { kind?: string }).kind
        if (requestKind !== "compaction" && event.agent !== "compaction") return
        if (event.agent !== undefined && event.agent !== "compaction" && !isAionAgent(event.agent)) return
        const output = { context: [] as string[], prompt: undefined }
        await hook({ sessionID: event.sessionID, messages: event.messages }, output)
        for (const text of output.context) event.system.push({ type: "text", text })
      }))
    }

    if (hooks.event) {
      const hook = hooks.event
      const controller = new AbortController()
      void (async () => {
        try {
          for await (const event of context.event.subscribe({ signal: controller.signal })) {
            await hook({ event: { type: event.type, properties: event } })
          }
        } catch (error) {
          if (!controller.signal.aborted) console.warn("[aion] event subscription error", error)
        }
      })()
      registrations.push({ dispose: async () => controller.abort() })
    }

    info("[aion] native V2 plugin registered", {
      toolCount: Object.keys(tools).length,
      registrationCount: registrations.length,
    })

    // Boot quip: one "AION is awake" beat per workspace load. The 60s entrance
    // debounce in the personality handle folds the session.created that
    // follows a cold start into this same toast.
    personality.onSessionCreated()

    const cleanup = async () => {
      for (const registration of registrations.reverse()) await registration.dispose()
    }
    return Object.assign(cleanup, hooks)
  },
})

export default aionPlugin

export { AION_AGENT_NAMES } from "./agents/names"

export const _testing = {
  async planGraph() {
    return await import("./shared/plan-graph.js")
  },
  async boardView() {
    return await import("./shared/board-view.js")
  },
  async callGraph() {
    return await import("./shared/call-graph.js")
  },
  async runtimeControl() {
    return await import("./shared/runtime-control.js")
  },
  async scheduling() {
    return await import("./scheduling/state-machine.js")
  },
  async chatMessage() {
    return await import("./hooks/chat-message.js").then((module) => (module as any)._testing)
  },
  async toolGuard() {
    return await import("./hooks/tool-guard.js").then((module) => (module as any)._testing)
  },
  async governance() {
    return await import("./create-managers.js").then((module) => (module as any)._testing)
  },
  async personality() {
    const personalityModule = await import("./shared/personality.js")
    const handleModule = await import("./hooks/personality.js")
    return {
      ...personalityModule,
      createPersonality: handleModule.createPersonality,
      DEFAULT_PERSONALITY_CONFIG: handleModule.DEFAULT_PERSONALITY_CONFIG,
    }
  },
  async toastQueue() {
    return await import("./shared/toast-queue.js")
  },
}
