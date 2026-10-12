/**
 * Tool aggregator.
 *
 * Calls every individual tool factory (ztxexp, critic, memory, safety,
 * workspace, governance, todo, user-check) and spreads the results into a
 * single {@link AionTools} record.
 */
import type { AionManagers } from "./create-managers"
import type { AionTools } from "./tools/types"
import { createZtxexpTools } from "./tools/ztxexp"
import { createCriticTools } from "./tools/critic"
import { createMemoryTools } from "./tools/memory"
import { createSafetyTools } from "./tools/safety"
import { createWorkspaceTools } from "./tools/workspace"
import { createGovernanceTools } from "./tools/governance"
import { createTodoTools } from "./tools/todo"
import { createInteractiveModeTool } from "./tools/user-check"
import { createLanguageTool } from "./tools/language"
import { createHfDatasetsTools } from "./tools/hf-datasets"
import type { PluginContext, ToolsRecord } from "./plugin/types"
import type { AionConfig } from "./config/types"
import { v2Tool, type V2ToolDefinition } from "./plugin/tool-adapter"
import type { AionToolName, AionShimTools } from "./tools/types"

export type CreateToolsArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
}

export type CreatedTools = AionTools

export function createAllAionTools(args: CreateToolsArgs): CreatedTools {
  const { ctx, config, managers } = args

  const v1: AionShimTools = {
    ...createZtxexpTools({ ctx, config, managers }),
    ...createCriticTools({ ctx, config, managers }),
    ...createMemoryTools({ ctx, config, managers }),
    ...createSafetyTools({ ctx, config, managers }),
    ...createWorkspaceTools({ ctx, config, managers }),
    ...createGovernanceTools({ ctx, config, managers }),
    ...createTodoTools({ ctx, config, managers }),
    ...createInteractiveModeTool({ ctx, config, managers }),
    ...createLanguageTool({ ctx, config, managers }),
    ...createHfDatasetsTools({ ctx, config, managers }),
  }

  const v2: Partial<Record<AionToolName, V2ToolDefinition>> = {}
  for (const [name, shim] of Object.entries(v1)) {
    if (!shim) continue
    v2[name as AionToolName] = v2Tool(name, shim.input) as V2ToolDefinition
  }
  return v2 as AionTools
}
