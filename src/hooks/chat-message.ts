/**
 * `chat.message` hook — per-message enrichment and intent routing.
 *
 * Fires on every incoming user message and:
 *   - Classifies the message intent via {@link detectIntent}
 *   - Detects mid-conversation interactive-mode toggles (the user saying
 *     "I'm leaving" / "switch to autonomous" or the reverse — matched by
 *     the LEAVE_PATTERNS / ENGAGE_PATTERNS regex sets which cover both
 *     English and Chinese phrasings)
 *   - Injects a phase + intent directive into the message
 *   - Persists the initial user prompt to memory
 *   - Triggers heartbeat personality quips
 *   - Infers phase transitions from tool-call patterns via
 *     {@link detectPhaseFromToolCall}
 */
import type { CreateHooksArgs } from "../create-hooks"
import type { AionChatMessageHook } from "./types"
import type { AionPhase } from "../create-managers"
import { detectIntent } from "./intent"
import { existsSync, writeFileSync, appendFileSync } from "node:fs"
import { join } from "node:path"
import { info } from "../shared/logger"
import type { AionManagers } from "../create-managers"

function detectPhaseFromToolCall(toolName: string, _args: Record<string, unknown>, currentPhase: AionPhase, m: AionManagers): AionPhase | null {
  // Workspace init → move to gather
  if (toolName === "aion_workspace_init" && currentPhase === "init") {
    return "gather"
  }

  // Critic dispatch → transition to the appropriate review phase
  if (toolName === "aion_critic_dispatch") {
    const critic = _args.critic as string | undefined
    if (critic === "ts-critic" && currentPhase === "gather") {
      return "ts-pre-review"
    }
    if (critic === "ts-critic" && currentPhase === "implement") {
      return "ts-post-review"
    }
    if (critic === "ts-critic" && (currentPhase === "ts-pre-review" || currentPhase === "ts-post-review")) {
      return null // already in review
    }
  }

  // Critic verdict → transition based on verdict
  if (toolName === "aion_critic_verdict") {
    const verdict = _args.verdict as string | undefined
    const critic = _args.critic as string | undefined

    if (critic === "ts-critic") {
      if (verdict === "allow-stop") {
        if (currentPhase === "ts-pre-review") {
          return "implement"
        }
        if (currentPhase === "ts-post-review") {
          // ts-critic allows stop from implementation review → proceed to c-critic-final
          return "c-critic-final"
        }
      }
      if (verdict === "absolutely-cannot-stop-now" || verdict === "rebuttal-mode" || verdict === "rollback") {
        // Block → loop back to gather or implement depending on context
        if (currentPhase === "ts-pre-review") {
          return "gather"
        }
        if (currentPhase === "ts-post-review") {
          return "implement"
        }
      }
    }

    if (critic === "c-critic") {
      if (verdict === "approve-stop") {
        return "done"
      }
      if (verdict === "reject-stop") {
        return "loop-back"
      }
    }
  }

  // Pre-stop gate
  if (toolName === "aion_pre_stop_gate") {
    if (currentPhase === "ts-post-review") {
      return "c-critic-final"
    }
  }

  // Resolving a blocker in loop-back → transition to gather
  if (toolName === "aion_resolve_blocker" && currentPhase === "loop-back") {
    return "gather"
  }

  return null
}

// Detect user intent to leave / switch to autonomous mode mid-conversation.
// The hook injects a directive so the LLM calls aion_set_interactive_mode(enabled=false).
// We use lookbehind/lookahead with ASCII alphanumerics instead of \b so CJK
// patterns (which \b cannot anchor) still match.
const ASCII_BEFORE = String.raw`(?<![A-Za-z0-9_])`
const ASCII_AFTER = String.raw`(?![A-Za-z0-9_])`
const LEAVE_PATTERNS: RegExp[] = [
  new RegExp(`${ASCII_BEFORE}(我要走了|我得走了|我先走了|先走了)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(i'?m leaving|i have to go|i need to go|gotta go|stepping away|i'?m out)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(不打扰了|不用再问了|别再问了|不要问我|别问了)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(stop asking me|don'?t ask me|don'?t bother|do not ask)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(全自动|全自动跑|别来烦我|完全自主|不要打断|不要人工|不要交互)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(run (it )?autonomous|fully autonomous|full auto|go fully auto|switch to auto|go auto|full auto mode)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(不要暂停|不要交互|以后别问|以后不要再问)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(i don'?t want to (be involved|participate)|i won'?t (be here|be available))${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(set (it )?to autonomous|switch to non-interactive|disable interactive)${ASCII_AFTER}`, "i"),
]

// Detect user intent to enable / re-enable interactive mode mid-conversation.
const ENGAGE_PATTERNS: RegExp[] = [
  new RegExp(`${ASCII_BEFORE}(我在|我回来了|我在看|我在听)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(i'?m back|i'?m here|i'?m watching|i'm here)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(交互模式|开启交互|进入交互|以后问我|开始问我)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(enable interactive|switch to interactive|ask me|check with me)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(继续问我|先问我|和我确认|和我讨论)${ASCII_AFTER}`, "i"),
  new RegExp(`${ASCII_BEFORE}(check in with me|let me weigh in|ask for my input)${ASCII_AFTER}`, "i"),
]

function detectInteractiveModeIntent(text: string): "leave" | "engage" | null {
  for (const re of LEAVE_PATTERNS) {
    if (re.test(text)) return "leave"
  }
  for (const re of ENGAGE_PATTERNS) {
    if (re.test(text)) return "engage"
  }
  return null
}

export const _testing = {
  LEAVE_PATTERNS,
  ENGAGE_PATTERNS,
  detectInteractiveModeIntent,
} as const

export function createChatMessageHook(args: CreateHooksArgs): AionChatMessageHook {
  const { ctx, config, managers, personality } = args

  return async function onChatMessage(input, output) {
    const { sessionID, agent } = input
    const { message, parts } = output

    const textParts = parts
      .filter((p: any) => p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text as string)
    const userText = textParts.join(" ").trim()

    if (!userText) return

    const intent = detectIntent(userText)
    const prevPhase = managers.phase.current()

    // === Detect mid-conversation interactive mode toggle ===
    // The user said something like "I'm leaving" or "run fully auto" or "go interactive".
    // Inject a directive into the system message so the LLM immediately calls
    // aion_set_interactive_mode to update runtime state.
    const modeIntent = detectInteractiveModeIntent(userText)
    if (modeIntent && (message as any)) {
      const currentMode = managers.state.governance.interactiveModeResolved
      const targetMode: "interactive" | "autonomous" = modeIntent === "leave" ? "autonomous" : "interactive"
      const targetLabel = targetMode === "autonomous" ? "autonomous (no user prompts)" : "interactive (ask between rounds)"
      // Only inject if a switch is actually needed (i.e. user wants opposite of current state).
      const currentIsInteractive = managers.interactiveMode.isInteractive()
      if (
        (modeIntent === "leave" && currentIsInteractive) ||
        (modeIntent === "engage" && !currentIsInteractive && currentMode !== "unset")
      ) {
        managers.trace.appendEvent(
          "stopgo.updated",
          `user requested interactive mode switch → ${targetMode} (via chat.message pattern)`,
          { userText: userText.slice(0, 200), fromMode: currentMode, toMode: targetMode },
          "user",
        )
        // Append a directive to the system message (as a synthetic assistant hint).
        // We do this by appending to message.content if accessible; otherwise rely on system-transform.
        const hint = `\n\n[AION USER MODE TOGGLE DETECTED] The user's latest message strongly indicates they want to switch to ${targetLabel}. You MUST immediately call aion_set_interactive_mode(enabled=${targetMode === "interactive"}, reason="user said: ${userText.slice(0, 120).replace(/"/g, "'")}") to update runtime state. Acknowledge briefly to the user, then continue the work.`
        if (typeof (message as any).content === "string") {
          ;(message as any).content = ((message as any).content ?? "") + hint
        } else if (Array.isArray((message as any).content)) {
          ;(message as any).content.push({ type: "text", text: hint })
        }
        // Also pre-emptively update state so subsequent system-transform / session-idle use it.
        managers.interactiveMode.resolve(targetMode, "user-toggle")
        managers.userContinue.reset()
      }
    }

    managers.trace.appendEvent(
      "file.written",
      `chat.message: intent=${intent}, agent=${agent ?? "unknown"}, phase=${prevPhase}, text_len=${userText.length}`,
      { intent, agent, sessionID, phase: prevPhase, textLength: userText.length },
      agent ?? "unknown",
    )

    info("[aion] chat.message hook", { intent, agent, sessionID, phase: prevPhase, textLength: userText.length, modeIntent })

    const initialPromptPath = managers.workspace.initialPromptPath()
    if (!existsSync(initialPromptPath) || !existsSync(managers.workspace.progressPath())) {
      writeFileSync(initialPromptPath, userText, "utf-8")
      info("[aion] saved initial prompt", { path: initialPromptPath })

      const initMarker = join(ctx.directory, ".opencode", "memory", ".init-done")
      if (!existsSync(initMarker)) {
        writeFileSync(initMarker, new Date().toISOString(), "utf-8")
        info("[aion] workspace auto-init marker created")
      }
    } else {
      appendFileSync(initialPromptPath, `\n\n---\n\n${userText}`, "utf-8")
    }

    // Personality: every user message is an opportunity for a heartbeat,
    // gated internally by min/max interval and per-session cap. Toast only,
    // never in LLM context.
    personality?.onOpportunity()

    managers.state._lastIntent = intent
    managers.state._lastSessionID = sessionID
  }
}