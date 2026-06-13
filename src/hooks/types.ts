/**
 * Type declarations for every AION hook.
 *
 * Each hook mirrors an OpenCode plugin lifecycle extension point. The
 * {@link AionHooks} record maps hook names to optional handler signatures.
 * Concrete implementations live in the sibling files (tool-guard.ts,
 * compaction.ts, etc.).
 *
 * Also defines {@link AionIntent} — the coarse intent categories the
 * chat-message hook classifies user messages into.
 */
import type { Model, Provider, Permission, Message, Part } from "@opencode-ai/sdk"
import type { ProviderContext } from "@opencode-ai/plugin"

export type AionHookName =
  | "tool.execute.before"
  | "tool.execute.after"
  | "session.idle"
  | "experimental.session.compacting"
  | "chat.message"
  | "chat.params"
  | "experimental.chat.system.transform"
  | "experimental.chat.messages.transform"
  | "permission.ask"
  | "tool.definition"
  | "event"

export type AionHooks = {
  "tool.execute.before"?: AionToolExecuteBeforeHook
  "tool.execute.after"?: AionToolExecuteAfterHook
  "session.idle"?: AionSessionIdleHook
  "experimental.session.compacting"?: AionCompactingHook
  "chat.message"?: AionChatMessageHook
  "chat.params"?: AionChatParamsHook
  "experimental.chat.system.transform"?: AionSystemTransformHook
  "experimental.chat.messages.transform"?: AionMessagesTransformHook
  "permission.ask"?: AionPermissionAskHook
  "tool.definition"?: AionToolDefinitionHook
  "event"?: AionEventHook
}

export type AionToolExecuteBeforeHook = (
  input: { tool: string; sessionID?: string; callID?: string },
  output: { args?: Record<string, unknown>; metadata?: Record<string, unknown> },
) => Promise<void> | void

export type AionToolExecuteAfterHook = (
  input: { tool: string; sessionID?: string; callID?: string },
  output: { title?: string; output?: string; metadata?: Record<string, unknown> },
) => Promise<void> | void

export type AionSessionIdleHook = (
  input: { sessionID: string },
  output: { continue?: boolean; prompt?: string },
) => Promise<void> | void

export type AionCompactingHook = (
  input: { sessionID: string; messages?: unknown[] },
  output: { context?: string[]; prompt?: string },
) => Promise<void> | void

export type AionChatMessageHook = (
  input: {
    sessionID: string
    agent?: string
    model?: { providerID: string; modelID: string }
    messageID?: string
    variant?: string
  },
  output: {
    message: {
      id: string
      sessionID: string
      role: "user"
      agent: string
      model: { providerID: string; modelID: string }
      system?: string
      tools?: Record<string, boolean>
    }
    parts: Array<{ type: string; text?: string; [key: string]: unknown }>
  },
) => Promise<void> | void

export type AionChatParamsHook = (
  input: {
    sessionID: string
    agent: string
    model: Model
    provider: ProviderContext
  },
  output: {
    temperature: number
    topP: number
    topK: number
    maxOutputTokens: number | undefined
    options: Record<string, unknown>
  },
) => Promise<void> | void

export type AionSystemTransformHook = (
  input: {
    sessionID?: string
    model: { id: string; name?: string }
  },
  output: { system: string[] },
) => Promise<void> | void

export type AionMessagesTransformHook = (
  input: Record<string, unknown>,
  output: {
    messages: Array<{
      info: Message
      parts: Part[]
    }>
  },
) => Promise<void> | void

export type AionPermissionAskHook = (
  input: Permission,
  output: { status: "ask" | "deny" | "allow" },
) => Promise<void> | void

export type AionToolDefinitionHook = (
  input: { toolID: string },
  output: { description: string; parameters: unknown },
) => Promise<void> | void

export type AionEventHook = (input: { event: { type: string; properties?: unknown } }) => Promise<void> | void

export type AionIntent =
  | "search"
  | "experiment"
  | "review"
  | "plan"
  | "implement"
  | "analyze"
  | "general"
