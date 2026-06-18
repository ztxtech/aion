/**
 * Tool name union and record type for all AION tools.
 *
 * The 20 tools (prefixed `aion_`) cover governance, memory, safety,
 * workspace lifecycle, critic dispatch, experiment management (ztxexp),
 * interactive-mode control, language, and Hugging Face dataset access.
 */
import type { AionManagers } from "../create-managers"
import type { PluginContext, ToolsRecord } from "../plugin/types"

export type AionToolName =
  | "aion_ztxexp_init"
  | "aion_ztxexp_validate"
  | "aion_ztxexp_run"
  | "aion_critic_dispatch"
  | "aion_critic_verdict"
  | "aion_memory_sync"
  | "aion_safety_gate"
  | "aion_workspace_init"
  | "aion_compaction"
  | "aion_pre_stop_gate"
  | "aion_leakage_check"
  | "aion_record_blocker"
  | "aion_resolve_blocker"
  | "aion_todo_update"
  | "aion_set_interactive_mode"
  | "aion_set_language"
  | "aion_hf_search"
  | "aion_hf_info"
  | "aion_hf_ingest"
  | "aion_hf_suggest"

export type AionTools = Record<AionToolName, import("@opencode-ai/plugin").ToolDefinition>
