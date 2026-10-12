/**
 * AION plugin entry point.
 *
 * This is the single default export that OpenCode loads. It wires the entire
 * AION subsystem together in a fixed order:
 *   1. Load + validate config from .opencode/aion.jsonc
 *   2. Bootstrap the on-disk workspace (memory files, trace, snapshot)
 *   3. Build the personality handle (TUI quips)
 *   4. Create the central manager bag (state, trace, governance, ...)
 *   5. Register all AION tools (critic, memory, safety, ...)
 *   6. Register all OpenCode hooks (tool-guard, compaction, chat, ...)
 *   7. Assemble the final PluginInstance returned to OpenCode
 *
 * The `_testing` export exposes lazy dynamic-import loaders so unit tests can
 * reach internal hook/tool modules without bundling them into production.
 */
import type { Plugin } from "@opencode/plugin"
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { loadAionConfig } from "./config/load-config"
import { createAionManagers } from "./create-managers"
import { createAllAionTools } from "./create-tools"
import { createAionHooks } from "./create-hooks"
import { createAionPluginInterface } from "./plugin-interface"
import { bootstrapWorkspace } from "./workspace-bootstrap"
import { buildAionAgents } from "./agents/registry"
import { createPersonality, DEFAULT_PERSONALITY_CONFIG, type PersonalityConfig } from "./hooks/personality"
import { info } from "./shared/logger"

const aionPlugin: Plugin = async (input, _options) => {
  info("[aion] ENTRY - plugin loading", {
    directory: input.directory,
  })

  const config = await loadAionConfig(input.directory, input)

  bootstrapWorkspace(input.directory, config)

  const personalityConfig: PersonalityConfig = {
    ...DEFAULT_PERSONALITY_CONFIG,
    ...(config.personality ?? {}),
  }

  const personality = createPersonality({
    client: input.client,
    config: personalityConfig,
  })

  const managers = createAionManagers({
    ctx: input,
    config,
    onPhaseChange: (_prev, next) => {
      personality.onPhaseTransition(next)
    },
  })

  const tools = createAllAionTools({
    ctx: input,
    config,
    managers,
  })

  const hooks = createAionHooks({
    ctx: input,
    config,
    managers,
    personality,
  })

  const pluginInterface = createAionPluginInterface({
    ctx: input,
    config,
    managers,
    hooks,
    tools,
  })

  info("[aion] plugin loaded", {
    aionToolCount: Object.keys(tools).length,
    hookCount: Object.keys(hooks).length,
  })

  return pluginInterface
}

type V2Context = {
  location: { directory: string }
  options: Record<string, unknown>
  tool: {
    transform: (callback: (editor: { add: (tool: Record<string, unknown>) => void }) => void) => Promise<{ dispose: () => Promise<void> }>
    hook: (name: string, callback: (event: any) => void | Promise<void>) => Promise<{ dispose: () => Promise<void> }>
  }
  permission: {
    hook: (name: string, callback: (event: any) => void | Promise<void>) => Promise<{ dispose: () => Promise<void> }>
  }
  session: {
    hook: (name: string, callback: (event: any) => void | Promise<void>, options?: Record<string, unknown>) => Promise<{ dispose: () => Promise<void> }>
  }
  event: {
    subscribe: (options?: { signal?: AbortSignal }) => AsyncIterable<any>
  }
  agent: {
    reload: () => Promise<void>
    transform: (callback: (editor: { default: (id?: string) => void }) => void) => Promise<{ dispose: () => Promise<void> }>
  }
}

type V2PluginModule = {
  id: string
  server: Plugin
  setup: (context: V2Context) => Promise<() => Promise<void> | void>
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

function writeManagedAgent(directory: string, name: string, config: Record<string, any>) {
  const agentDir = join(directory, ".opencode", "agents")
  const agentPath = join(agentDir, `${name}.md`)
  const marker = "<!-- aion-plugin:managed -->"

  if (existsSync(agentPath)) {
    const content = readFileSync(agentPath, "utf8")
    if (!content.includes(marker)) return
  }

  mkdirSync(agentDir, { recursive: true })
  const frontmatter = [
    "---",
    marker,
    `description: ${yamlValue(config.description ?? "")}`,
    `mode: ${yamlValue(config.mode ?? "subagent")}`,
    ...(config.model ? [`model: ${yamlValue(config.model)}`] : []),
    ...(config.color ? [`color: ${yamlValue(config.color)}`] : []),
    ...(permissionRules(config.permission).length
      ? [
          "permissions:",
          ...permissionRules(config.permission).map((rule) =>
            `  - { action: ${yamlValue(rule.action)}, resource: ${yamlValue(rule.resource)}, effect: ${yamlValue(rule.effect)} }`,
          ),
        ]
      : []),
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
  ]
  const system = Array.isArray(config.prompt) ? config.prompt.join("\n") : config.prompt ?? ""

  writeFileSync(agentPath, `${frontmatter.join("\n")}\n\n${system}\n`)
}

const aionPluginModule: V2PluginModule = {
  id: "aion-ts-plugin",
  server: aionPlugin,
  async setup(context) {
    const directory = context.location.directory
    const instance = (await aionPlugin({
      directory,
      client: undefined,
      options: context.options,
    }, context.options)) as Record<string, any>
    const registrations: Array<{ dispose: () => Promise<void> }> = []
    const config = await loadAionConfig(directory, { directory, options: context.options })

    for (const [name, agent] of Object.entries(buildAionAgents())) {
      writeManagedAgent(directory, name, agent)
    }
    await context.agent.reload()
    await context.agent.transform((editor) => {
      if (config.defaultAgent) editor.default(config.defaultAgent)
    })

    await context.tool.transform((editor) => {
      for (const [name, definition] of Object.entries(instance.tool ?? {})) {
        if (!definition) continue
        editor.add({
          name,
          description: definition.description,
          input: definition.input,
          options: { codemode: definition.options?.codemode === true },
          execute: definition.execute,
        })
      }
    })

    if (instance["tool.execute.before"]) {
      registrations.push(await context.tool.hook("execute.before", async (event) => {
        await instance["tool.execute.before"](event, {
          args: event.input,
          metadata: {},
        })
      }))
    }

    if (instance["tool.execute.after"]) {
      registrations.push(await context.tool.hook("execute.after", async (event) => {
        await instance["tool.execute.after"](event, {
          output: event.status === "completed" ? event.result?.content : undefined,
          metadata: {},
        })
      }))
    }

    if (instance["permission.ask"]) {
      registrations.push(await context.permission.hook("evaluate", async (event) => {
        const output = { status: "ask" as "ask" | "deny" | "allow" }
        await instance["permission.ask"](event, output)
        event.effect = output.status
      }))
    }

    if (instance["chat.message"]) {
      registrations.push(await context.session.hook("prompt", async (event) => {
        const output = {
          message: {
            id: event.messageID,
            sessionID: event.sessionID,
            role: "user" as const,
            agent: "",
            model: { providerID: "", modelID: "" },
          },
          parts: [],
        }
        await instance["chat.message"]({
          sessionID: event.sessionID,
          messageID: event.messageID,
        }, output)
      }))
    }

    registrations.push(await context.session.hook("context", async (event) => {
      if (instance["chat.params"]) {
        const output = {
          temperature: undefined,
          topP: undefined,
          topK: undefined,
          maxOutputTokens: undefined,
          options: {},
        }
        await instance["chat.params"]({
          sessionID: event.sessionID,
          agent: event.agent,
          model: event.model,
          provider: {},
        }, output)
        if (output.temperature !== undefined) event.options.temperature = output.temperature
        if (output.topP !== undefined) event.options.topP = output.topP
        if (output.topK !== undefined) event.options.topK = output.topK
        if (output.maxOutputTokens !== undefined) event.options.maxTokens = output.maxOutputTokens
        Object.assign(event.options, output.options)
      }

      if (instance["experimental.chat.system.transform"]) {
        const output = { system: event.system.map((part: any) => part.text ?? "") }
        await instance["experimental.chat.system.transform"]({
          sessionID: event.sessionID,
          model: event.model,
        }, output)
        event.system = output.system.map((text: string) => ({ type: "text" as const, text }))
      }
    }))

    if (instance.event) {
      const controller = new AbortController()
      void (async () => {
        try {
          for await (const event of context.event.subscribe({ signal: controller.signal })) {
            await instance.event({ event: { type: event.type, properties: event } })
          }
        } catch (error) {
          if (!controller.signal.aborted) console.warn("[aion] event subscription error", error)
        }
      })()
      registrations.push({
        dispose: async () => {
          controller.abort()
        },
      })
    }

    return async () => {
      for (const registration of registrations.reverse()) {
        await registration.dispose()
      }
    }
  },
}

export default aionPluginModule

export const AionPlugin = aionPlugin
export { aionPluginModule as pluginModule }

export type { AionConfig, AionPluginConfig } from "./config/types"
export type { AionManagers, AionPhase } from "./create-managers"
export type { AionToolName, AionTools } from "./tools/types"
export type { AionHookName, AionHooks } from "./hooks/types"
export { AION_AGENT_NAMES } from "./agents/names"

// Test-only exports. Not for production use; for unit tests to verify
// internal behavior of individual hooks/tools.
export const _testing = {
  async chatMessage() {
    return await import("./hooks/chat-message.js")
      .then((m) => (m as any)._testing)
  },
  async toolGuard() {
    return await import("./hooks/tool-guard.js")
      .then((m) => (m as any)._testing)
  },
  async governance() {
    return await import("./create-managers.js")
      .then((m) => (m as any)._testing)
  },
  async personality() {
    const personalityMod = await import("./shared/personality.js")
    const handleMod = await import("./hooks/personality.js")
    return {
      ...personalityMod,
      ...handleMod,
    }
  },
  async scheduling() {
    return await import("./scheduling/state-machine.js")
  },
} as const
