/**
 * Tool aggregator.
 *
 * Calls every individual tool factory (ztxexp, critic, memory, safety,
 * workspace, governance, todo, user-check) and spreads the results into a
 * single {@link AionTools} record. When team mode is enabled the team toolset
 * is attached under a nested `team` key so it can be flattened separately by
 * the plugin interface.
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
import { createTeamTools } from "./team/tools"
import type { PluginContext, ToolsRecord } from "./plugin/types"
import type { AionConfig } from "./config/types"

export type CreateToolsArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
}

export type CreatedTools = AionTools & { team?: ReturnType<typeof createTeamTools> }

export function createAllAionTools(args: CreateToolsArgs): CreatedTools {
  const { ctx, config, managers } = args

  const aionTools: AionTools = {
    ...(createZtxexpTools({ ctx, config, managers }) as AionTools),
    ...(createCriticTools({ ctx, config, managers }) as AionTools),
    ...(createMemoryTools({ ctx, config, managers }) as AionTools),
    ...(createSafetyTools({ ctx, config, managers }) as AionTools),
    ...(createWorkspaceTools({ ctx, config, managers }) as AionTools),
    ...(createGovernanceTools({ ctx, config, managers }) as AionTools),
    ...(createTodoTools({ ctx, config, managers }) as AionTools),
    ...(createInteractiveModeTool({ ctx, config, managers }) as AionTools),
  }

  const result: CreatedTools = { ...aionTools }
  if (config.teamMode.enabled) {
    result.team = createTeamTools({
      directory: ctx.directory,
      teamMode: config.teamMode,
      trace: managers.trace as unknown as {
        appendEvent: (event: string, data: Record<string, unknown>) => void
      },
    })
  }
  return result
}
