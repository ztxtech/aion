#!/usr/bin/env bash
# =============================================================================
# AION dev-install — push the local build to ~/.local/lib/aion/
# =============================================================================
# This is the dev counterpart to scripts/install.sh.
#
# install.sh downloads the released tarball and installs it to:
#   - ~/.local/bin/aion-ts         (CLI wrapper)
#   - ~/.local/lib/aion/aion.js    (the plugin bundle aion-init.js copies)
#   - ~/.local/lib/aion/aion-init.js
#   - ~/.local/lib/aion/aion-theme.json
#
# When you edit source under src/ and want to test it inside a project that
# was set up via `aion-ts init <dir> --force`, you need the latest bundle to
# be the one that aion-init.js picks up. By default aion-init.js's findBundlePath()
# chooses ~/.local/lib/aion/aion.js (see bin/aion-init.js:194) when running
# from ~/.local/bin/aion-init.js. So this script rebuilds the singlefile
# bundle and pushes it (plus the theme and aion-init.js) to ~/.local/lib/aion/.
#
# After running this you do NOT need to re-run install.sh. Just:
#
#   aion-ts init /path/to/project --force
#
# and the new bundle is copied into that project's .opencode/plugins/aion.js.
#
# Usage:
#   bash scripts/dev-install.sh                # build + push
#   bash scripts/dev-install.sh --skip-build   # push existing build only
#   bash scripts/dev-install.sh --lib-dir <p>  # override target (default ~/.local/lib/aion)
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[aion-dev]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

SKIP_BUILD=false
LIB_DIR="${HOME}/.local/lib/aion"

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --lib-dir)    LIB_DIR="$2"; shift 2 ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//; 1d'
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# Locate repo root (the dir that contains src/ and .opencode/plugins/).
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -d "$REPO_ROOT/src" ] || fail "could not find src/ at $REPO_ROOT — run from the repo root."

# 1. Build
if [ "$SKIP_BUILD" = false ]; then
  command -v bun >/dev/null 2>&1 || fail "bun is required. Install: curl -fsSL https://bun.sh/install | bash"
  info "building singlefile bundle (bun run build:singlefile)..."
  ( cd "$REPO_ROOT" && bun run build:singlefile )
  ok "build complete → $REPO_ROOT/.opencode/plugins/aion.js"
fi

BUNDLE="$REPO_ROOT/.opencode/plugins/aion.js"
[ -f "$BUNDLE" ] || fail "bundle not found at $BUNDLE — run bun run build:singlefile first."

# 2. Push to ~/.local/lib/aion
info "installing into $LIB_DIR/"
mkdir -p "$LIB_DIR"
cp "$BUNDLE" "$LIB_DIR/aion.js"
ok "bundle      → $LIB_DIR/aion.js"

THEME_SRC="$REPO_ROOT/.opencode/themes/aion.json"
if [ -f "$THEME_SRC" ]; then
  cp "$THEME_SRC" "$LIB_DIR/aion-theme.json"
  ok "theme       → $LIB_DIR/aion-theme.json"
fi

CLI_SRC="$REPO_ROOT/bin/aion-init.js"
if [ -f "$CLI_SRC" ]; then
  cp "$CLI_SRC" "$LIB_DIR/aion-init.js"
  chmod +x "$LIB_DIR/aion-init.js"
  ok "cli         → $LIB_DIR/aion-init.js"
fi

# 3. Done — tell the user what to do next.
echo ""
ok "dev install complete"
echo ""
echo "  Next, redeploy the bundle into your project (overwrites the old one):"
echo ""
echo -e "    ${CYAN}aion-ts init /Users/ztx/Documents/code/tmp/aion-demo/aion-plug --force${NC}"
echo ""
echo "  or your full reset+rerun workflow:"
echo ""
echo -e "    ${CYAN}find /Users/ztx/Documents/code/tmp/aion-demo/aion-plug -maxdepth 1 -mindepth 1 ! -name 'task.md' -exec rm -rf {} + && aion-ts init /Users/ztx/Documents/code/tmp/aion-demo/aion-plug --force && cd /Users/ztx/Documents/code/tmp/aion-demo/aion-plug && opencode${NC}"
echo ""
