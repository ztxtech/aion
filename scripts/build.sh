#!/usr/bin/env bash
# =============================================================================
# AION plugin — build + package script
# =============================================================================
# Builds the TypeScript server and TUI bundles, compiles the CLI installer, and
# packs everything into a release tarball that can be attached to a GitHub Release.
#
# Usage:
#   bash scripts/build.sh                # build + pack (version from package.json)
#   bash scripts/build.sh --no-pack      # build only, skip tarball
#   bash scripts/build.sh --version 0.2.0  # override version in tarball name
#
# Output:
#   dist/                           — NPM-style build (index.js + .d.ts)
#   .opencode/plugins/aion/         — V2 server and TUI bundle
#   release/aion-plugin-{version}.tar.gz — distributable tarball
#
# The tarball contains:
#   plugins/aion/          — the plugin bundle (copied to target's .opencode/plugins/)
#   themes/aion.json      — the AION theme
#   bin/aion-init.js      — the compiled CLI installer
#
# Prerequisites: bun, node (for tsc)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[build]${NC} $*"; }
ok()    { echo -e "${GREEN}[ok]${NC} $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC} $*"; }
fail()  { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# Parse args
DO_PACK=true
VERSION_OVERRIDE=""
for arg in "$@"; do
  case "$arg" in
    --no-pack)    DO_PACK=false ;;
    --version)    shift_next=true ;;
    *)
      if [ "${shift_next:-}" = "true" ]; then
        VERSION_OVERRIDE="$arg"
        shift_next=false
      fi
      ;;
  esac
done

# Check prerequisites
command -v bun >/dev/null 2>&1 || fail "bun is required (https://bun.sh)"
command -v node >/dev/null 2>&1 || fail "node is required (https://nodejs.org)"

# Read version from package.json unless overridden
if [ -n "$VERSION_OVERRIDE" ]; then
  VERSION="$VERSION_OVERRIDE"
else
  VERSION=$(node -pe "require('./package.json').version")
fi
info "building AION plugin v$VERSION"

# Step 1: Install deps if node_modules is missing
if [ ! -d "node_modules" ]; then
  info "installing dependencies..."
  npm ci 2>/dev/null || npm install
fi

# Step 2: Clean previous build
info "cleaning previous build..."
rm -rf dist .opencode/plugins/aion .opencode/plugins/aion.js

# Step 3: Build NPM bundle (dist/index.js — bun target)
info "building NPM bundle (dist/index.js)..."
bun build src/index.ts --outdir dist --target bun --format esm
ok "dist/index.js"

# Step 4: Build native V2 server and TUI bundles.
info "building V2 server bundle (.opencode/plugins/aion/server.js)..."
bun build src/index.ts --outfile .opencode/plugins/aion/server.js --target node --format esm
ok ".opencode/plugins/aion/server.js"

info "building V2 TUI bundle (.opencode/plugins/aion/tui.js)..."
bun build src/tui/index.tsx --outfile .opencode/plugins/aion/tui.js --target bun --format esm \
  --external @opencode/plugin/tui --external solid-js \
  --external @opentui/core --external @opentui/solid --external @opencode/theme
ok ".opencode/plugins/aion/tui.js"

# Step 5: Build CLI installer (dist/bin/aion-init.js — node target)
info "building CLI installer (dist/bin/aion-init.js)..."
bun build bin/aion-init.js --outdir dist/bin --target node --format esm
ok "dist/bin/aion-init.js"

# Step 6: Emit TypeScript declaration files (.d.ts)
info "emitting TypeScript declarations..."
npx tsc --emitDeclarationOnly
ok "declaration files"

# Step 7: Verify both bundles are non-trivial.
for bundle in server.js tui.js; do
  BUNDLE_SIZE=$(wc -c < ".opencode/plugins/aion/$bundle" | tr -d ' ')
  if [ "$BUNDLE_SIZE" -lt 1000 ]; then
    fail "$bundle is suspiciously small ($BUNDLE_SIZE bytes) — check for build errors"
  fi
  ok "$bundle size: $(du -h ".opencode/plugins/aion/$bundle" | cut -f1)"
done

# Step 8: Typecheck
info "running typecheck..."
npx tsc --noEmit
ok "typecheck passed"

if [ "$DO_PACK" = "false" ]; then
  echo ""
  ok "build complete (packing skipped)"
  exit 0
fi

# Step 9: Pack release tarball
TARBALL="release/aion-plugin-${VERSION}.tar.gz"
info "packing release tarball: $TARBALL"

rm -rf release
mkdir -p release

# Create a staging dir, copy the artifacts, then tar
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/plugins/aion" "$STAGE/themes" "$STAGE/bin" "$STAGE/skills"
cp .opencode/plugins/aion/server.js "$STAGE/plugins/aion/server.js"
cp .opencode/plugins/aion/tui.js "$STAGE/plugins/aion/tui.js"
cp .opencode/themes/aion.json "$STAGE/themes/aion.json"
cp dist/bin/aion-init.js "$STAGE/bin/aion-init.js"
# Copy the 17 AION skills so a fresh `aion-ts init` finds them.
# Use tar to preserve the directory layout; fall back silently if missing.
if [ -d ".opencode/skills" ]; then
  tar -cf - -C .opencode skills | tar -xf - -C "$STAGE"
fi

tar -czf "$TARBALL" -C "$STAGE" plugins themes bin skills
ok "$TARBALL ($(du -h "$TARBALL" | cut -f1))"

echo ""
ok "build + pack complete"
echo ""
echo "  Tarball:  $TARBALL"
echo "  Contents: plugins/aion/, themes/aion.json, bin/aion-init.js, skills/<17-skill-dirs>"
echo ""
echo "  To create a GitHub Release and attach the tarball:"
echo "    gh release create v$VERSION $TARBALL --target master --title \"v$VERSION\" --notes \"Release v$VERSION\""
