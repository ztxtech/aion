/**
 * Convenience type aliases derived from the OpenCode plugin SDK.
 *
 * These unwrap the SDK's parameterized `Plugin` function signature into
 * the concrete shapes used throughout AION, so the rest of the codebase
 * does not need to repeat `Parameters<Plugin>[0]` gymnastics.
 */
import type { Plugin } from "@opencode-ai/plugin"

export type PluginContext = Parameters<Plugin>[0]
export type PluginInstance = Awaited<ReturnType<Plugin>>
export type ToolsRecord = Record<string, import("@opencode-ai/plugin").ToolDefinition>
