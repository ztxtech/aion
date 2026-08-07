#!/usr/bin/env bash
# workspace-init/init.sh
# Initialize .opencode runtime files from templates.
# Compatible with: macOS (bash/zsh), Linux (bash/zsh), Windows (Git Bash).
#
# Usage:
#   bash .opencode/skills/workspace-init/init.sh
#   # or from any directory:
#   bash /path/to/.opencode/skills/workspace-init/init.sh

set -euo pipefail

# ── Resolve paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_DIR="$(cd "$SCRIPT_DIR/../../" && pwd)"
PROJECT_ROOT="$(cd "$OPENCODE_DIR/.." && pwd)"

TEMPLATE_DIR="$OPENCODE_DIR/memory/template"
MEMORY_DIR="$OPENCODE_DIR/memory"
TRACE_FILE="$OPENCODE_DIR/trace.md"

# ── Counters ──────────────────────────────────────────────────────────────────
CREATED=0
SKIPPED=0

log_created() { echo "  [+] created: $1"; CREATED=$((CREATED + 1)); }
log_skipped() { echo "  [=] exists:  $1"; SKIPPED=$((SKIPPED + 1)); }

# ── 1. Git initialization ────────────────────────────────────────────────────
echo "── git ──"
if git -C "$PROJECT_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    echo "  [=] git repo already exists at $PROJECT_ROOT"
else
    git -C "$PROJECT_ROOT" init
    echo "  [+] git repo initialized at $PROJECT_ROOT"
fi

# ── 2. Trace file ─────────────────────────────────────────────────────────────
echo ""
echo "── trace ──"
if [ -f "$TRACE_FILE" ]; then
    log_skipped "$TRACE_FILE"
else
    if [ -f "$TEMPLATE_DIR/trace.md" ]; then
        cp "$TEMPLATE_DIR/trace.md" "$TRACE_FILE"
        log_created "$TRACE_FILE"
    else
        cat > "$TRACE_FILE" <<'EOF'
# AION Pipeline Trace

| Time | Phase | Actor | Evidence | Next gate |
|------|-------|-------|----------|-----------|
EOF
        log_created "$TRACE_FILE (fallback skeleton)"
    fi
fi

# ── 3. Memory files ──────────────────────────────────────────────────────────
echo ""
echo "── memory ──"
mkdir -p "$MEMORY_DIR"

MEMORY_FILES=(
    memory.md
    positive.md
    negative.md
    relation.md
    progress.md
    features.md
    decisions.md
    todo-map.md
    completion-gate.md
    initial-prompt.md
    context-snapshot.md
)

for f in "${MEMORY_FILES[@]}"; do
    target="$MEMORY_DIR/$f"
    if [ -f "$target" ]; then
        log_skipped "$target"
    else
        template="$TEMPLATE_DIR/$f"
        if [ -f "$template" ]; then
            cp "$template" "$target"
            log_created "$target"
        else
            echo "  [!] template not found: $template"
        fi
    fi
done

# ── 4. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "── summary ──"
echo "  created: $CREATED"
echo "  skipped: $SKIPPED (already exist, not overwritten)"
echo ""
echo "Done. Runtime files are ready."
