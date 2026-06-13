import type { AionManagers } from "./create-managers"
import type { AionConfig } from "./config/types"
import type { PluginContext } from "./plugin/types"
import type { AionHooks } from "./hooks/types"
import { createToolGuardBeforeHook, createToolGuardAfterHook } from "./hooks/tool-guard"
import { createCompactionHook } from "./hooks/compaction"
import { createSessionIdleHook } from "./hooks/session-idle"
import { createEventHook } from "./hooks/event"
import { createChatMessageHook } from "./hooks/chat-message"
import { createChatParamsHook } from "./hooks/chat-params"
import { createSystemTransformHook } from "./hooks/system-transform"
import { createMessagesTransformHook } from "./hooks/messages-transform"
import { createPermissionAskHook } from "./hooks/permission-ask"
import { createToolDefinitionHook } from "./hooks/tool-definition"
import type { PersonalityHandle } from "./hooks/personality"

export type CreateHooksArgs = {
  ctx: PluginContext
  config: AionConfig
  managers: AionManagers
  personality?: PersonalityHandle
}

export function createAionHooks(args: CreateHooksArgs): AionHooks {
  const { ctx, config, managers, personality } = args

  return {
    "tool.execute.before": createToolGuardBeforeHook({ ctx, config, managers }),
    "tool.execute.after": createToolGuardAfterHook({ ctx, config, managers }),
    "experimental.session.compacting": createCompactionHook({ ctx, config, managers }),
    "session.idle": createSessionIdleHook({ ctx, config, managers }),
    "chat.message": createChatMessageHook({ ctx, config, managers, personality }),
    "chat.params": createChatParamsHook({ ctx, config, managers }),
    "experimental.chat.system.transform": createSystemTransformHook({ ctx, config, managers, personality }),
    "experimental.chat.messages.transform": createMessagesTransformHook({ ctx, config, managers }),
    "permission.ask": createPermissionAskHook({ ctx, config, managers }),
    "tool.definition": createToolDefinitionHook({ ctx, config, managers }),
    event: createEventHook({ ctx, config, managers, personality }),
  }
}
