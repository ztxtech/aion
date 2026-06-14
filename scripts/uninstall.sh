#!/usr/bin/env bash
# =============================================================================
# AION plugin — Uninstaller
# =============================================================================
# Removes AION from the system and/or from a specific project.
#
# Two modes:
#
# 1. System uninstall (default):
#    Removes the CLI wrapper and bundle library.
#      - ~/.local/bin/aion-ts
#      - ~/.local/lib/aion/
#
# 2. Project uninstall (--project <dir>):
#    Removes AION-specific files from a project. ALL removed files are
#    backed up to a timestamped .tar.gz before deletion.
#      - <dir>/.opencode/plugins/aion.js     (AION plugin bundle)
#      - <dir>/.opencode/themes/aion.json    (AION theme)
#      - <dir>/.opencode/aion.jsonc          (AION config)
#    It also cleans the "theme": "aion" line from <dir>/opencode.json
#    (the file itself is NEVER deleted — it may contain other settings).
#    It does NOT touch:
#      - .opencode/memory/      (session data, user decisions)
#      - .opencode/trace.md     (session trace)
#      - .opencode/skills/      (may contain user's custom skills)
#      - opencode.json          (only the theme line is cleaned, file kept)
#
# Usage:
#   curl -fsSL .../uninstall.sh | bash                           # system only
#   curl -fsSL .../uninstall.sh | bash -s -- --project .         # system + current project
#   curl -fsSL .../uninstall.sh | bash -s -- --project . --no-system  # project only
#   bash scripts/uninstall.sh --project /path/to/project
#
# Options:
#   --project DIR   Also uninstall from the given project directory.
#   --no-system     Skip system-level uninstall (use with --project).
#   --bin-dir PATH  Where the aion-ts CLI lives (default: ~/.local/bin)
#   --lib-dir PATH  Where the bundle lives (default: ~/.local/lib/aion)
#   --dry-run       Show what would be removed without actually removing.
#   --help, -h      Show this help.
# =============================================================================
set -euo pipefail

# =============================================================================
# Helpers
# =============================================================================
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()  { echo -e "${CYAN}[aion]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# =============================================================================
# Parse args
# =============================================================================
BIN_DIR="${HOME}/.local/bin"
LIB_DIR="${HOME}/.local/lib/aion"
PROJECT_DIR=""
DO_SYSTEM=true
DRY_RUN=false

while [ $# -gt 0 ]; do
  case "$1" in
    --project)    PROJECT_DIR="$2"; shift 2 ;;
    --no-system)  DO_SYSTEM=false; shift ;;
    --bin-dir)    BIN_DIR="$2"; shift 2 ;;
    --lib-dir)    LIB_DIR="$2"; shift 2 ;;
    --dry-run)    DRY_RUN=true; shift ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \?//; 1d'
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# =============================================================================
# System-level uninstall
# =============================================================================
if [ "$DO_SYSTEM" = true ]; then
  echo ""
  info "uninstalling system-level AION..."
  echo ""

  WRAPPER="${BIN_DIR}/aion-ts"
  if [ -f "$WRAPPER" ]; then
    if [ "$DRY_RUN" = true ]; then
      info "[dry-run] would remove: $WRAPPER"
    else
      rm -f "$WRAPPER"
      ok "removed CLI wrapper  → ${WRAPPER}"
    fi
  else
    info "no CLI wrapper at ${WRAPPER} (already removed?)"
  fi

  if [ -d "$LIB_DIR" ]; then
    if [ "$DRY_RUN" = true ]; then
      info "[dry-run] would remove: $LIB_DIR"
    else
      rm -rf "$LIB_DIR"
      ok "removed bundle dir   → ${LIB_DIR}"
    fi
  else
    info "no bundle dir at ${LIB_DIR} (already removed?)"
  fi
fi

# =============================================================================
# Project-level uninstall
# =============================================================================
if [ -n "$PROJECT_DIR" ]; then
  if [ ! -d "$PROJECT_DIR" ]; then
    fail "project directory does not exist: $PROJECT_DIR"
  fi

  # Resolve to absolute path
  PROJECT_DIR="$(cd "$PROJECT_DIR" && pwd)"

  echo ""
  info "uninstalling AION from project: $PROJECT_DIR"
  echo ""

  # --- Identify AION-specific files ---
  # These are the ONLY files that aion-ts init creates. Everything else
  # in .opencode/ (memory/, trace.md, skills/, etc.) is user/session data
  # and must NOT be touched.
  AION_PLUGIN="${PROJECT_DIR}/.opencode/plugins/aion.js"
  AION_THEME="${PROJECT_DIR}/.opencode/themes/aion.json"
  AION_CONFIG="${PROJECT_DIR}/.opencode/aion.jsonc"
  OPENCODE_JSON="${PROJECT_DIR}/opencode.json"

  # Collect files that exist and will be backed up + removed
  FILES_TO_BACKUP=()
  for f in "$AION_PLUGIN" "$AION_THEME" "$AION_CONFIG"; do
    if [ -f "$f" ]; then
      FILES_TO_BACKUP+=("$f")
    fi
  done

  if [ ${#FILES_TO_BACKUP[@]} -eq 0 ] && ! grep -q '"aion"' "$OPENCODE_JSON" 2>/dev/null; then
    info "no AION files found in this project (already clean?)"
  else
    # --- Create backup tarball ---
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    BACKUP_FILE="${PROJECT_DIR}/.opencode/aion-backup-${TIMESTAMP}.tar.gz"

    if [ "$DRY_RUN" = true ]; then
      info "[dry-run] would backup these files to ${BACKUP_FILE}:"
      for f in "${FILES_TO_BACKUP[@]}"; do
        echo "    $f"
      done
    else
      # Ensure .opencode exists (it should, since we found files in it)
      mkdir -p "${PROJECT_DIR}/.opencode"

      # Create the tarball with relative paths for clean extraction
      cd "$PROJECT_DIR"
      if [ ${#FILES_TO_BACKUP[@]} -gt 0 ]; then
        tar -czf "$BACKUP_FILE" "${FILES_TO_BACKUP[@]/#${PROJECT_DIR}\//}" 2>/dev/null
        ok "backed up ${#FILES_TO_BACKUP[@]} file(s) → $(basename "$BACKUP_FILE")"
      fi

      # --- Remove AION-specific files ---
      for f in "${FILES_TO_BACKUP[@]}"; do
        rm -f "$f"
        ok "removed              → ${f#${PROJECT_DIR}/}"
      done

      # --- Clean opencode.json (remove theme: "aion", keep everything else) ---
      if [ -f "$OPENCODE_JSON" ]; then
        if grep -q '"aion"' "$OPENCODE_JSON" 2>/dev/null; then
          # Use node to safely parse, remove the theme key if it's "aion",
          # and re-serialize. This handles trailing commas, whitespace, etc.
          TMP_JSON=$(mktemp)
          node -e "
            const fs = require('fs');
            const raw = fs.readFileSync('$OPENCODE_JSON', 'utf8');
            // Strip JSONC comments for parsing
            const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '')
              .split('\n').map(l => l.replace(/(^|[^:])\/\/.*$/, '\$1')).join('\n');
            try {
              const obj = JSON.parse(stripped);
              let changed = false;
              if (obj.theme === 'aion') {
                delete obj.theme;
                changed = true;
              }
              if (changed) {
                fs.writeFileSync('$TMP_JSON', JSON.stringify(obj, null, 2) + '\n');
                console.log('cleaned');
              } else {
                console.log('no-change');
              }
            } catch(e) {
              console.log('parse-error:' + e.message);
            }
          " > /tmp/aion-uninstall-clean-result.txt 2>/dev/null
          CLEAN_RESULT=$(cat /tmp/aion-uninstall-clean-result.txt)

          if [ "$CLEAN_RESULT" = "cleaned" ]; then
            # node wrote the cleaned JSON to TMP_JSON
            cp "$TMP_JSON" "$OPENCODE_JSON"
            ok "cleaned              → opencode.json (removed theme: \"aion\")"
          elif [ "$CLEAN_RESULT" = "no-change" ]; then
            info "opencode.json has no AION theme — skipping"
          else
            warn "opencode.json could not be parsed — left untouched"
            warn "manually remove \"theme\": \"aion\" if needed"
          fi
          rm -f "$TMP_JSON" /tmp/aion-uninstall-clean-result.txt
        else
          info "opencode.json has no AION references — skipping"
        fi
      fi

      # --- Clean up empty directories (only if AION was the last occupant) ---
      PLUGINS_DIR="${PROJECT_DIR}/.opencode/plugins"
      THEMES_DIR="${PROJECT_DIR}/.opencode/themes"
      if [ -d "$PLUGINS_DIR" ] && [ -z "$(ls -A "$PLUGINS_DIR" 2>/dev/null)" ]; then
        rmdir "$PLUGINS_DIR"
        ok "removed empty dir    → .opencode/plugins/"
      fi
      if [ -d "$THEMES_DIR" ] && [ -z "$(ls -A "$THEMES_DIR" 2>/dev/null)" ]; then
        rmdir "$THEMES_DIR"
        ok "removed empty dir    → .opencode/themes/"
      fi
    fi
  fi

  # --- What was NOT touched (reassure the user) ---
  echo ""
  echo "  The following were NOT touched (user/session data):"
  echo "    .opencode/memory/        — session memory, decisions, progress"
  echo "    .opencode/trace.md       — session trace log"
  echo "    .opencode/skills/        — skill definitions (may have user content)"
  echo "    opencode.json            — kept (only the AION theme line was removed)"
  if [ "$DRY_RUN" = false ] && [ ${#FILES_TO_BACKUP[@]} -gt 0 ]; then
    echo ""
    echo "  Backup saved to: $(basename "$BACKUP_FILE")"
    echo "  To restore: tar -xzf $(basename "$BACKUP_FILE")"
  fi
fi

# =============================================================================
# Done
# =============================================================================
echo ""
if [ "$DRY_RUN" = true ]; then
  ok "dry-run complete — nothing was actually removed."
else
  ok "uninstall complete!"
fi
echo ""
