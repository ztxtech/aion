/**
 * Convenience type aliases derived from the OpenCode plugin SDK.
 *
 * These unwrap the SDK's parameterized `Plugin` function signature into
 * the concrete shapes used throughout AION, so the rest of the codebase
 * does not need to repeat `Parameters<Plugin>[0]` gymnastics.
 */
export type PluginContext = {
  directory: string
  client?: unknown
  [key: string]: unknown
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export type PluginInstance = Record<string, any>
export type ToolsRecord = Record<string, import("./tool-adapter").V2ToolDefinition>
