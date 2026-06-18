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

export type CreateToolsArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
}

export type CreatedTools = AionTools

export function createAllAionTools(args: CreateToolsArgs): CreatedTools {
  const { ctx, config, managers } = args

  return {
    ...(createZtxexpTools({ ctx, config, managers }) as AionTools),
    ...(createCriticTools({ ctx, config, managers }) as AionTools),
    ...(createMemoryTools({ ctx, config, managers }) as AionTools),
    ...(createSafetyTools({ ctx, config, managers }) as AionTools),
    ...(createWorkspaceTools({ ctx, config, managers }) as AionTools),
    ...(createGovernanceTools({ ctx, config, managers }) as AionTools),
    ...(createTodoTools({ ctx, config, managers }) as AionTools),
    ...(createInteractiveModeTool({ ctx, config, managers }) as AionTools),
    ...(createLanguageTool({ ctx, config, managers }) as AionTools),
    ...(createHfDatasetsTools({ ctx, config, managers }) as AionTools),
  }
}
