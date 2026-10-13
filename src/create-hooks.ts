/**
 * Hook aggregator.
 *
 * Thin wiring layer that instantiates every AION hook factory and returns
 * them as the {@link AionHooks} record consumed by the plugin interface.
 * The actual logic lives in src/hooks/*.
 */
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
  function scoped<Input, Output>(
    hook: (input: Input, output: Output) => Promise<void> | void,
    sessionIDFrom: (input: Input) => string | undefined = (input) =>
      (input as { sessionID?: string }).sessionID,
  ) {
    return async (input: Input, output: Output) => {
      const sessionID = sessionIDFrom(input)
      await managers.runtimeControl.withSession(sessionID, async () => {
        try {
          await hook(input, output)
        } finally {
          if (sessionID) managers.runtimeControl.checkpoint()
        }
      })
    }
  }

  return {
    "tool.execute.before": scoped(createToolGuardBeforeHook({ ctx, config, managers })),
    "tool.execute.after": scoped(createToolGuardAfterHook({ ctx, config, managers, personality })),
    "experimental.session.compacting": scoped(createCompactionHook({ ctx, config, managers })),
    "session.idle": scoped(createSessionIdleHook({ ctx, config, managers })),
    "chat.message": scoped(createChatMessageHook({ ctx, config, managers, personality })),
    "chat.params": scoped(createChatParamsHook({ ctx, config, managers })),
    "experimental.chat.system.transform": scoped(
      createSystemTransformHook({ ctx, config, managers, personality }),
    ),
    "experimental.chat.messages.transform": scoped(
      createMessagesTransformHook({ ctx, config, managers }),
      (input) => (input as { sessionID?: string; info?: { sessionID?: string } }).sessionID
        ?? (input as { info?: { sessionID?: string } }).info?.sessionID,
    ),
    "tool.definition": scoped(createToolDefinitionHook({ ctx, config, managers }), () => undefined),
    event: createEventHook({ ctx, config, managers, personality }),
  }
}
