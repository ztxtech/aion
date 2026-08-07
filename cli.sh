#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# AION CLI — Run-mode entry point for OpenCode with auto-continue
# =============================================================================
# This script provides a simple CLI for launching AION agents in either
# run mode (non-interactive, auto-continuing) or TUI mode (interactive).
#
# Usage:
#   bash cli.sh                          # Basic run
#   bash cli.sh -m anthropic/claude-sonnet-4  # With specific model
#   bash cli.sh --mode tui               # Interactive TUI
#   bash cli.sh --debug --export         # Debug with session export
#
# Prerequisites:
#   - OpenCode installed (https://opencode.ai)
#   - .opencode/ directory in current working directory (or parent)
#   - opencode.json configured with rules and default_agent
# =============================================================================

SCRIPT_NAME="$(basename "$0")"
LOG_TAG="[$SCRIPT_NAME]"

usage() {
  cat <<HELP | sed "s/__SCRIPT_NAME__/$SCRIPT_NAME/g"
Usage:
  bash __SCRIPT_NAME__ [options]

AION CLI runner — launches OpenCode agents in run or TUI mode with optional
auto-continue for long-running autonomous sessions.

Options:
  --mode MODE           Launch mode: run (default) or tui
  -m, --model MODEL     OpenCode model (format: provider/model)
  --max-continues N     Max auto-continue rounds; default 30; 0 = unlimited
  --continue-delay S    Seconds between auto-continue rounds; default 2
  --bash-timeout-ms N   OpenCode bash default timeout (ms); default 1200000
  --no-auto-continue    Disable auto-continue; stop after first round
  --prompt TEXT         Custom initial prompt; overrides the default
  --debug               Enable verbose debug logging
  --export              Export session JSON on completion
  --debug-dir DIR       Custom directory for debug/export artifacts
  -h, --help            Show this help

Examples:
  bash __SCRIPT_NAME__
  bash __SCRIPT_NAME__ -m anthropic/claude-sonnet-4
  bash __SCRIPT_NAME__ --mode tui --no-auto-continue
  bash __SCRIPT_NAME__ --max-continues 5 --debug --export
  bash __SCRIPT_NAME__ --prompt "Analyze the dataset in data/"
  bash __SCRIPT_NAME__ -m openai/gpt-4.1 --max-continues 10 --debug

Prerequisites:
  1. Install OpenCode:     curl -fsSL https://opencode.ai/install | bash
  2. Add AION to project:  git clone https://github.com/ztxtech/aion.git .opencode
  3. Configure:            create opencode.json (see README.md)
HELP
}

# ---- Defaults ----
RUN_MODE="run"
MODEL_NAME=""
MAX_CONTINUES=30
CONTINUE_DELAY_SEC=2
BASH_TIMEOUT_MS="${OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS:-1200000}"
AUTO_CONTINUE=1
ENABLE_DEBUG=0
ENABLE_EXPORT=0
CUSTOM_DEBUG_DIR=""
CUSTOM_PROMPT=""

DEFAULT_INITIAL_PROMPT="Read the root task files and the .opencode contract first. Classify the task, load only the native skills required for the current task, delegate work to the matching agents, and complete the task end-to-end. Treat this run as autonomous unless a material user decision is required. Stop only after the configured critic gates approve."
DEFAULT_CONTINUE_PROMPT="Continue the current run from the latest context snapshot. Preserve the evidence chain, use the matching agent or skill for the next slice, and stop only after the configured critic gates approve."

# ---- Parse arguments ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      RUN_MODE="$2"
      shift 2
      ;;
    -m|--model)
      MODEL_NAME="$2"
      shift 2
      ;;
    --max-continues)
      MAX_CONTINUES="$2"
      shift 2
      ;;
    --continue-delay)
      CONTINUE_DELAY_SEC="$2"
      shift 2
      ;;
    --bash-timeout-ms)
      BASH_TIMEOUT_MS="$2"
      shift 2
      ;;
    --no-auto-continue)
      AUTO_CONTINUE=0
      shift
      ;;
    --prompt)
      CUSTOM_PROMPT="$2"
      shift 2
      ;;
    --debug)
      ENABLE_DEBUG=1
      shift
      ;;
    --export)
      ENABLE_EXPORT=1
      shift
      ;;
    --debug-dir)
      CUSTOM_DEBUG_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "$LOG_TAG unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# ---- Validate ----
case "$RUN_MODE" in
  run|tui) ;;
  *)
    echo "$LOG_TAG invalid --mode: $RUN_MODE (expected run or tui)" >&2
    exit 1
    ;;
esac

if ! [[ "$MAX_CONTINUES" =~ ^[0-9]+$ ]]; then
  echo "$LOG_TAG --max-continues must be a non-negative integer" >&2
  exit 1
fi

if ! [[ "$CONTINUE_DELAY_SEC" =~ ^[0-9]+$ ]]; then
  echo "$LOG_TAG --continue-delay must be a non-negative integer" >&2
  exit 1
fi

# ---- Resolve debug directory ----
RUN_ID="$(date +%Y%m%d-%H%M%S)"
DEBUG_DIR="${CUSTOM_DEBUG_DIR:-.debug/aion-${RUN_ID}}"

if [[ "$ENABLE_DEBUG" -eq 1 || "$ENABLE_EXPORT" -eq 1 || -n "$CUSTOM_DEBUG_DIR" ]]; then
  mkdir -p "$DEBUG_DIR"
fi

# ---- Environment ----
export OPENCODE_ENABLE_EXA="${OPENCODE_ENABLE_EXA:-1}"
export OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS="$BASH_TIMEOUT_MS"

# ---- Summary ----
echo "$LOG_TAG === AION CLI ==="
echo "$LOG_TAG mode           : $RUN_MODE"
if [[ -n "$MODEL_NAME" ]]; then
  echo "$LOG_TAG model         : $MODEL_NAME"
else
  echo "$LOG_TAG model         : <default from opencode config>"
fi
echo "$LOG_TAG auto-continue   : $AUTO_CONTINUE"
echo "$LOG_TAG max continues   : $MAX_CONTINUES"
echo "$LOG_TAG continue delay  : ${CONTINUE_DELAY_SEC}s"
echo "$LOG_TAG bash timeout    : ${BASH_TIMEOUT_MS}ms"
if [[ "$ENABLE_DEBUG" -eq 1 ]]; then
  echo "$LOG_TAG debug dir     : $DEBUG_DIR"
fi

# ---- Helper: collect session ID ----
collect_session_id() {
  local session_list_path="$DEBUG_DIR/session-list.json"
  opencode session list --max-count 20 --format json > "$session_list_path" 2>/dev/null || true
  if [[ -f "$session_list_path" && -s "$session_list_path" ]]; then
    python3 - "$PWD" "$session_list_path" <<'PY' 2>/dev/null || true
import json, sys
from pathlib import Path
try:
    sessions = json.loads(Path(sys.argv[2]).read_text(encoding='utf-8'))
    for item in sessions:
        if item.get('directory') == sys.argv[1]:
            print(item['id'])
            break
except Exception:
    pass
PY
  fi
}

# ---- Helper: run one round ----
run_round() {
  local round="$1"
  local session_id="$2"
  local exit_code=0
  local start_prompt="${CUSTOM_PROMPT:-$DEFAULT_INITIAL_PROMPT}"
  local -a cmd

  if [[ "$round" -eq 1 && -z "$session_id" ]]; then
    # First round, fresh session
    if [[ "$RUN_MODE" == "run" ]]; then
      cmd=(opencode run --agent agent "$start_prompt")
    else
      cmd=(opencode --agent agent --prompt "$start_prompt")
    fi
  else
    # Continue existing session
    local continue_prompt="$DEFAULT_CONTINUE_PROMPT"
    if [[ "$RUN_MODE" == "run" ]]; then
      cmd=(opencode run --session "$session_id" --agent agent "$continue_prompt")
    else
      cmd=(opencode --session "$session_id" --agent agent --prompt "$continue_prompt")
    fi
  fi

  if [[ -n "$MODEL_NAME" ]]; then
    cmd+=(--model "$MODEL_NAME")
  fi

  if [[ "$ENABLE_DEBUG" -eq 1 ]]; then
    cmd+=(--print-logs --log-level DEBUG)
  fi

  local cmd_str
  cmd_str="$(printf '%q ' "${cmd[@]}")"
  echo "$LOG_TAG round $round: $cmd_str"

  if [[ "$ENABLE_DEBUG" -eq 1 || "$ENABLE_EXPORT" -eq 1 || -n "$CUSTOM_DEBUG_DIR" ]]; then
    printf '%s\n' "$cmd_str" > "$DEBUG_DIR/command-round-$(printf '%03d' "$round").txt"
  fi

  # Execute
  if "${cmd[@]}"; then
    exit_code=0
  else
    exit_code=$?
  fi

  return "$exit_code"
}

# ---- Main loop ----
ROUND=1
CONTINUE_COUNT=0
LAST_EXIT_CODE=0
SESSION_ID=""

while true; do
  echo "$LOG_TAG --- round $ROUND ---"

  if run_round "$ROUND" "$SESSION_ID"; then
    LAST_EXIT_CODE=0
  else
    LAST_EXIT_CODE=$?
  fi

  # Collect session ID after each round
  SESSION_ID="$(collect_session_id | tr -d '\n')"

  if [[ "$ENABLE_DEBUG" -eq 1 || "$ENABLE_EXPORT" -eq 1 || -n "$CUSTOM_DEBUG_DIR" ]]; then
    echo "$SESSION_ID" > "$DEBUG_DIR/session-id.txt"
  fi

  if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
    echo "$LOG_TAG opencode exited with code $LAST_EXIT_CODE"
    break
  fi

  if [[ "$AUTO_CONTINUE" -eq 0 ]]; then
    echo "$LOG_TAG auto-continue disabled; stopping after round $ROUND"
    break
  fi

  if [[ -z "$SESSION_ID" ]]; then
    echo "$LOG_TAG no session ID found; stopping"
    break
  fi

  if [[ "$MAX_CONTINUES" -ne 0 && "$CONTINUE_COUNT" -ge "$MAX_CONTINUES" ]]; then
    echo "$LOG_TAG reached max continues ($MAX_CONTINUES); stopping"
    break
  fi

  CONTINUE_COUNT=$((CONTINUE_COUNT + 1))
  ROUND=$((ROUND + 1))
  echo "$LOG_TAG auto-continue #$CONTINUE_COUNT with session $SESSION_ID after ${CONTINUE_DELAY_SEC}s"
  sleep "$CONTINUE_DELAY_SEC"
done

# ---- Export session if requested ----
if [[ "$ENABLE_EXPORT" -eq 1 && -n "$SESSION_ID" ]]; then
  echo "$LOG_TAG exporting session: $SESSION_ID"
  opencode export "$SESSION_ID" > "$DEBUG_DIR/session-export.json" 2>/dev/null || true
fi

if [[ "$ENABLE_DEBUG" -eq 1 || "$ENABLE_EXPORT" -eq 1 || -n "$CUSTOM_DEBUG_DIR" ]]; then
  echo "$LOG_TAG artifacts dir: $DEBUG_DIR"
fi

echo "$LOG_TAG done (exit code: $LAST_EXIT_CODE)"
exit "$LAST_EXIT_CODE"
