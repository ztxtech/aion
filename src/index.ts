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
import type { Plugin, PluginModule } from "@opencode-ai/plugin"
import { loadAionConfig } from "./config/load-config"
import { createAionManagers } from "./create-managers"
import { createAllAionTools } from "./create-tools"
import { createAionHooks } from "./create-hooks"
import { createAionPluginInterface } from "./plugin-interface"
import { bootstrapWorkspace } from "./workspace-bootstrap"
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

const aionPluginModule: PluginModule = {
  id: "aion-ts-plugin",
  server: aionPlugin,
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
