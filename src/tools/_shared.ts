/**
 * Shared types and helpers for tool factories.
 *
 * {@link CreateToolsArgs} is the common argument bag passed to every
 * `create*Tools` function. {@link noopTool} is a placeholder used during
 * incremental tool migration.
 */
import type { z } from "zod"
import type { AionManagers } from "../create-managers"
import type { PluginContext, ToolsRecord } from "../plugin/types"
import type { AionConfig } from "../config/types"

export type CreateToolsArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
}

export function noopTool() {
  return undefined
}
