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
import { createComplexityTool } from "./tools/complexity"
import { createHfDatasetsTools } from "./tools/hf-datasets"
import type { PluginContext, ToolsRecord } from "./plugin/types"
import type { AionConfig } from "./config/types"
import type { AionToolName, AionToolMap } from "./tools/types"

export type CreateToolsArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
}

export type CreatedTools = AionTools

export function createAllAionTools(args: CreateToolsArgs): CreatedTools {
  const { ctx, config, managers } = args

  const bodies: AionToolMap = {
    ...createZtxexpTools({ ctx, config, managers }),
    ...createCriticTools({ ctx, config, managers }),
    ...createMemoryTools({ ctx, config, managers }),
    ...createSafetyTools({ ctx, config, managers }),
    ...createWorkspaceTools({ ctx, config, managers }),
    ...createGovernanceTools({ ctx, config, managers }),
    ...createTodoTools({ ctx, config, managers }),
    ...createInteractiveModeTool({ ctx, config, managers }),
    ...createLanguageTool({ ctx, config, managers }),
    ...createComplexityTool({ ctx, config, managers }),
    ...createHfDatasetsTools({ ctx, config, managers }),
  }

  const tools: Partial<AionTools> = {}
  for (const [name, body] of Object.entries(bodies)) {
    if (!body) continue
    const execute: AionTools[AionToolName]["execute"] = async (input, context) => {
      const sessionID = (context as { sessionID?: string } | undefined)?.sessionID
      return managers.runtimeControl.withSession(sessionID, async () => {
        try {
          return await body.execute(input, context)
        } finally {
          if (sessionID) managers.runtimeControl.checkpoint()
        }
      })
    }
    tools[name as AionToolName] = { ...body, execute, name } as AionTools[AionToolName]
  }
  return tools as AionTools
}
