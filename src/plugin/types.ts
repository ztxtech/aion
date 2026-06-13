import type { Plugin } from "@opencode-ai/plugin"

export type PluginContext = Parameters<Plugin>[0]
export type PluginInstance = Awaited<ReturnType<Plugin>>
export type ToolsRecord = Record<string, import("@opencode-ai/plugin").ToolDefinition>
