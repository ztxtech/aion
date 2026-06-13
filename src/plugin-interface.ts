import type { AionConfig } from "./config/types"
import type { AionManagers } from "./create-managers"
import type { PluginContext, PluginInstance, ToolsRecord } from "./plugin/types"
import type { AionHooks } from "./hooks/types"
import { buildAionAgents } from "./agents/registry"
import { info, warn } from "./shared/logger"
import type { CreatedTools } from "./create-tools"

export type CreatePluginInterfaceArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
  hooks: AionHooks
  tools: CreatedTools
}

export function createAionPluginInterface(args: CreatePluginInterfaceArgs): PluginInstance {
  const { ctx, config, managers, hooks, tools } = args

  const aionAgents = buildAionAgents({})

  const flatTools: ToolsRecord = {}
  for (const [name, def] of Object.entries(tools)) {
    if (name === "team") continue
    flatTools[name] = def as ToolsRecord[string]
  }
  if (tools.team) {
    for (const [name, def] of Object.entries(tools.team)) {
      flatTools[name] = def as ToolsRecord[string]
    }
  }

  const interfaceHooks: PluginInstance = {
    "tool.execute.before": async (input, output) => {
      if (hooks["tool.execute.before"]) {
        try {
          await hooks["tool.execute.before"](input, output)
        } catch (err) {
          if (err instanceof Error && err.message.startsWith("[aion]")) throw err
          warn("[aion] tool.execute.before hook error (rethrowing)", { error: String(err) })
          throw err
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      if (hooks["tool.execute.after"]) {
        try {
          await hooks["tool.execute.after"](input, output)
        } catch (err) {
          warn("[aion] tool.execute.after hook error (swallowed to preserve output)", { error: String(err) })
        }
      }
    },
    "experimental.session.compacting": hooks["experimental.session.compacting"] as PluginInstance["experimental.session.compacting"],
    "experimental.compaction.autocontinue": async (input, output) => {
      if (hooks["session.idle"]) {
        try {
          await hooks["session.idle"](
            { sessionID: input.sessionID },
            {
              continue: output.enabled,
              prompt: undefined,
            },
          )
        } catch (err) {
          warn("[aion] compaction.autocontinue hook error (swallowed)", { error: String(err) })
        }
      }
    },
    "chat.message": hooks["chat.message"] as PluginInstance["chat.message"],
    "chat.params": hooks["chat.params"] ? (async (input, output) => {
      try {
        await hooks["chat.params"]!(input as Parameters<NonNullable<AionHooks["chat.params"]>>[0], output as Parameters<NonNullable<AionHooks["chat.params"]>>[1])
      } catch (err) {
        warn("[aion] chat.params hook error (swallowed)", { error: String(err) })
      }
    }) as PluginInstance["chat.params"] : undefined,
    "experimental.chat.system.transform": hooks["experimental.chat.system.transform"] as PluginInstance["experimental.chat.system.transform"],
    "experimental.chat.messages.transform": hooks["experimental.chat.messages.transform"] ? (async (_input, output) => {
      try {
        await hooks["experimental.chat.messages.transform"]!({}, output as Parameters<NonNullable<AionHooks["experimental.chat.messages.transform"]>>[1])
      } catch (err) {
        warn("[aion] experimental.chat.messages.transform hook error (swallowed)", { error: String(err) })
      }
    }) as PluginInstance["experimental.chat.messages.transform"] : undefined,
    "permission.ask": hooks["permission.ask"] ? (async (input, output) => {
      try {
        await hooks["permission.ask"]!(input as Parameters<NonNullable<AionHooks["permission.ask"]>>[0], output as Parameters<NonNullable<AionHooks["permission.ask"]>>[1])
      } catch (err) {
        warn("[aion] permission.ask hook error (swallowed)", { error: String(err) })
      }
    }) as PluginInstance["permission.ask"] : undefined,
    "tool.definition": hooks["tool.definition"] ? (async (input, output) => {
      try {
        await hooks["tool.definition"]!(input as Parameters<NonNullable<AionHooks["tool.definition"]>>[0], output as Parameters<NonNullable<AionHooks["tool.definition"]>>[1])
      } catch (err) {
        warn("[aion] tool.definition hook error (swallowed)", { error: String(err) })
      }
    }) as PluginInstance["tool.definition"] : undefined,
    event: hooks.event ? (async (input) => {
      try {
        await hooks.event!(input)
      } catch (err) {
        warn("[aion] event hook error (swallowed)", { error: String(err) })
      }
    }) as PluginInstance["event"] : undefined,
    config: async (configInput) => {
      const baseConfig = configInput as unknown as Record<string, unknown>

      // Inject model from aion.jsonc if set and user hasn't overridden
      if (config.model && !baseConfig.model) {
        baseConfig.model = config.model
      }

      // Set default agent
      baseConfig.default_agent = config.defaultAgent

      // Ensure the model's provider has it registered so OpenCode validation passes
      if (config.model) {
        const [providerID, ...modelParts] = config.model.split("/")
        const modelID = modelParts.join("/")
        if (providerID && modelID) {
          const providers = (baseConfig.provider ?? {}) as Record<string, Record<string, unknown>>
          const provider = (providers[providerID] ?? {}) as Record<string, unknown>
          const models = (provider.models ?? {}) as Record<string, Record<string, unknown>>
          if (!models[modelID]) {
            models[modelID] = { name: modelID }
            provider.models = models
            providers[providerID] = provider
            baseConfig.provider = providers
          }
        }
      }

      // Merge agents: plugin provides prompts, user opencode.json overrides
      const existingAgents = (baseConfig.agent ?? {}) as Record<string, Record<string, unknown>>
      const merged: Record<string, Record<string, unknown>> = {}
      for (const [name, pluginDef] of Object.entries(aionAgents)) {
        const existing = existingAgents[name] ?? {}
        merged[name] = { ...pluginDef, ...existing }
      }
      for (const [name, existing] of Object.entries(existingAgents)) {
        if (!merged[name]) merged[name] = existing
      }
      baseConfig.agent = merged
    },
    tool: flatTools as PluginInstance["tool"],
  } as PluginInstance

  info("[aion] plugin interface assembled", {
    agentNames: Object.keys(aionAgents),
    aionToolCount: Object.keys(flatTools).length - (tools.team ? Object.keys(tools.team).length : 0),
    teamToolCount: tools.team ? Object.keys(tools.team).length : 0,
    teamModeEnabled: config.teamMode.enabled,
    trace_path: managers.workspace.tracePath(),
    snapshot_path: managers.workspace.snapshotPath(),
  })

  return interfaceHooks
}
