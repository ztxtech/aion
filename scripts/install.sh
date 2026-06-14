#!/usr/bin/env bash
# =============================================================================
# AION plugin — CLI installer (curl-pipe-bash)
# =============================================================================
# Downloads the AION release tarball from GitHub and installs the `aion-ts`
# CLI to ~/.local/bin (the standard user-writable CLI location, NOT an
# OpenCode config directory).
#
# The plugin bundle + theme travel alongside the CLI. The CLI is project-
# level: running `aion-ts init [dir]` inside any project drops the plugin
# bundle + theme + config into that project's .opencode/ directory. Nothing
# is ever written to ~/.config/opencode/ or any global OpenCode config.
#
# Usage (curl-pipe-bash):
#   curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash
#
# With options:
#   curl -fsSL ... | bash -s -- --version 0.2.0
#
# Direct:
#   bash scripts/install.sh [options]
#
# Options:
#   --version VERSION   Release tag to install (default: latest)
#   --bin-dir  PATH     Where to install the aion-ts CLI (default: ~/.local/bin)
#   --force             Overwrite existing installation
#   --local    FILE     Install from a local tarball instead of GitHub (testing)
# =============================================================================
set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================
GITHUB_OWNER="ztxtech"
GITHUB_REPO="aion"

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
VERSION=""
BIN_DIR="${HOME}/.local/bin"
LIB_DIR="${HOME}/.local/lib/aion"
FORCE=false
LOCAL_TARBALL=""

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --bin-dir) BIN_DIR="$2"; shift 2 ;;
    --lib-dir) LIB_DIR="$2"; shift 2 ;;
    --force)   FORCE=true; shift ;;
    --local)   LOCAL_TARBALL="$2"; shift 2 ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# \?//; 1d'   # skip shebang
      exit 0
      ;;
    *) fail "Unknown option: $1" ;;
  esac
done

# =============================================================================
# Preflight checks
# =============================================================================
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"
command -v node >/dev/null 2>&1 || fail "node is required (the aion-ts CLI is a Node.js script)"

# =============================================================================
# Resolve version + download URL
# =============================================================================
if [ -n "$LOCAL_TARBALL" ]; then
  # Local tarball (testing mode — no network needed)
  [ -f "$LOCAL_TARBALL" ] || fail "local tarball not found: $LOCAL_TARBALL"
  info "installing from local tarball: $LOCAL_TARBALL"
  DOWNLOAD_MODE="local"
elif [ -z "$VERSION" ] || [ "$VERSION" = "latest" ]; then
  # Resolve latest version from GitHub API (with rate-limit fallback)
  info "resolving latest release..."
  VERSION=""
  API_ERR=""

  # Try /releases/latest first
  API_RESP=$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest" 2>/dev/null)
  API_RC=$?
  if [ -z "$API_RESP" ]; then
    # Try to fetch all releases and pick the first non-prerelease
    API_RESP=$(curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=20" 2>/dev/null)
    if [ -n "$API_RESP" ]; then
      VERSION=$(echo "$API_RESP" | node -pe '
        let s = "";
        try {
          const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
          if (Array.isArray(j)) {
            const r = j.find(x => x && x.tag_name && !x.prerelease && !x.draft);
            if (r) s = r.tag_name.replace(/^v/, "");
          }
        } catch {}
        s || ""
      ' 2>/dev/null | tr -d '\n')
    fi
    if [ -z "$VERSION" ]; then
      API_ERR="GitHub API unavailable (likely rate-limited: 60 req/hour for unauthenticated requests). Wait or use a personal access token via GH_TOKEN env var."
    fi
  else
    VERSION=$(echo "$API_RESP" | node -pe '
      let s = "";
      try {
        const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
        s = j.tag_name ? j.tag_name.replace(/^v/, "") : "";
      } catch {}
      s || ""
    ' 2>/dev/null | tr -d '\n')
    if [ -z "$VERSION" ]; then
      API_ERR="GitHub API returned an unexpected response (rate-limited or no releases yet)."
    fi
  fi

  if [ -z "$VERSION" ]; then
    fail "could not resolve latest release for ${GITHUB_OWNER}/${GITHUB_REPO}.
  Reason: ${API_ERR:-unknown}

  Workarounds:
    1. Wait 1 hour and retry (rate limit resets).

    2. Pin a specific version:
       curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash -s -- --force --version 0.4.0

    3. Install from a local tarball (testing):
       bash scripts/install.sh --local release/aion-plugin-0.4.0.tar.gz

    4. If you have a GitHub token, export it before running:
       export GH_TOKEN=ghp_xxx
       (advanced: install.sh could be extended to use \$GH_TOKEN for auth)"
  fi
  DOWNLOAD_MODE="release"
  DOWNLOAD_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${VERSION}/aion-plugin-${VERSION}.tar.gz"
else
  DOWNLOAD_MODE="release"
  DOWNLOAD_URL="https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/v${VERSION}/aion-plugin-${VERSION}.tar.gz"
fi

[ "$DOWNLOAD_MODE" = "local" ] || info "installing AION v$VERSION"

# =============================================================================
# Check for existing installation
# =============================================================================
if [ -f "${BIN_DIR}/aion-ts" ] && [ "$FORCE" = false ]; then
  VERSION_INFO=""
  [ -n "$VERSION" ] && VERSION_INFO=" -- --version $VERSION"
  echo ""
  warn "aion-ts is already installed at ${BIN_DIR}/aion-ts"
  echo ""
  echo "  To upgrade to the latest version, re-run with --force:"
  echo ""
  echo -e "    ${BOLD}curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash -s -- --force${NC}"
  echo ""
  echo "  Or install a specific version:"
  echo ""
  echo -e "    ${BOLD}curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash -s -- --force --version 0.3.0${NC}"
  echo ""
  exit 0
fi

# =============================================================================
# Download / locate tarball
# =============================================================================
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

if [ "$DOWNLOAD_MODE" = "local" ]; then
  TARBALL="$LOCAL_TARBALL"
else
  TARBALL="${TMP_DIR}/aion-plugin-${VERSION}.tar.gz"
  info "downloading release tarball..."
  curl -fsSL "$DOWNLOAD_URL" -o "$TARBALL" || \
    fail "failed to download from $DOWNLOAD_URL"
fi

info "extracting..."
tar -xzf "$TARBALL" -C "$TMP_DIR"

# =============================================================================
# Install: CLI + bundle + theme to ~/.local/lib/aion + ~/.local/bin
# =============================================================================
mkdir -p "$BIN_DIR" "$LIB_DIR"

# The tarball contains: plugins/aion.js, themes/aion.json, bin/aion-init.js
# Place the CLI + bundle into LIB_DIR, wrapper into BIN_DIR.
cp "$TMP_DIR/bin/aion-init.js" "$LIB_DIR/aion-init.js"
cp "$TMP_DIR/plugins/aion.js"  "$LIB_DIR/aion.js"
if [ -f "$TMP_DIR/themes/aion.json" ]; then
  cp "$TMP_DIR/themes/aion.json" "$LIB_DIR/aion-theme.json"
fi

# Create the aion-ts wrapper script
WRAPPER="${BIN_DIR}/aion-ts"
cat > "$WRAPPER" <<WRAPPER_EOF
#!/usr/bin/env bash
# Auto-generated by AION installer — do not edit.
# Runs the aion-ts project-level plugin installer.
exec node "${LIB_DIR}/aion-init.js" "\$@"
WRAPPER_EOF
chmod +x "$WRAPPER"

ok "installed aion-ts → ${WRAPPER}"

# =============================================================================
# PATH advice
# =============================================================================
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    warn "${BIN_DIR} is not in your PATH"
    echo ""
    echo "  Add this to your shell profile (~/.bashrc, ~/.zshrc, etc.):"
    echo ""
    echo -e "    ${BOLD}export PATH=\"${BIN_DIR}:\$PATH\"${NC}"
    echo ""
    echo "  Then restart your terminal or run: source ~/.bashrc"
    ;;
esac

# =============================================================================
# Done
# =============================================================================
echo ""
ok "AION CLI installed!"
echo ""
echo "  To install AION into a project:"
echo -e "    ${BOLD}cd /path/to/your/project && aion-ts init .${NC}"
echo ""
echo "  This drops the plugin bundle into .opencode/plugins/aion.js."
echo "  OpenCode auto-discovers it on next launch — no global config changes."
echo ""
