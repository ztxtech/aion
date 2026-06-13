#!/usr/bin/env bash
# =============================================================================
# AION plugin — build + package script
# =============================================================================
# Builds the TypeScript plugin, bundles the single-file plugin bundle, compiles
# the CLI installer, and packs everything into a release tarball that can be
# attached to a GitHub Release.
#
# Usage:
#   bash scripts/build.sh                # build + pack (version from package.json)
#   bash scripts/build.sh --no-pack      # build only, skip tarball
#   bash scripts/build.sh --version 0.2.0  # override version in tarball name
#
# Output:
#   dist/                           — NPM-style build (index.js + .d.ts)
#   .opencode/plugins/aion.js       — self-contained single-file bundle
#   release/aion-plugin-{version}.tar.gz — distributable tarball
#
# The tarball contains:
#   plugins/aion.js       — the plugin bundle (copied to target's .opencode/plugins/)
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
rm -rf dist .opencode/plugins/aion.js

# Step 3: Build NPM bundle (dist/index.js — bun target)
info "building NPM bundle (dist/index.js)..."
bun build src/index.ts --outdir dist --target bun --format esm
ok "dist/index.js"

# Step 4: Build single-file plugin (.opencode/plugins/aion.js — node target)
info "building single-file plugin bundle (.opencode/plugins/aion.js)..."
bun build src/index.ts --outfile .opencode/plugins/aion.js --target node --format esm
ok ".opencode/plugins/aion.js"

# Step 5: Build CLI installer (dist/bin/aion-init.js — node target)
info "building CLI installer (dist/bin/aion-init.js)..."
bun build bin/aion-init.js --outdir dist/bin --target node --format esm
ok "dist/bin/aion-init.js"

# Step 6: Emit TypeScript declaration files (.d.ts)
info "emitting TypeScript declarations..."
npx tsc --emitDeclarationOnly
ok "declaration files"

# Step 7: Verify the single-file bundle exists and is non-trivial
BUNDLE_SIZE=$(wc -c < .opencode/plugins/aion.js | tr -d ' ')
if [ "$BUNDLE_SIZE" -lt 100000 ]; then
  fail "plugin bundle is suspiciously small ($BUNDLE_SIZE bytes) — check for build errors"
fi
ok "plugin bundle size: $(du -h .opencode/plugins/aion.js | cut -f1)"

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

# Create a staging dir, copy the 3 artifacts, then tar
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/plugins" "$STAGE/themes" "$STAGE/bin"
cp .opencode/plugins/aion.js "$STAGE/plugins/aion.js"
cp .opencode/themes/aion.json "$STAGE/themes/aion.json"
cp dist/bin/aion-init.js "$STAGE/bin/aion-init.js"

tar -czf "$TARBALL" -C "$STAGE" plugins themes bin
ok "$TARBALL ($(du -h "$TARBALL" | cut -f1))"

echo ""
ok "build + pack complete"
echo ""
echo "  Tarball:  $TARBALL"
echo "  Contents: plugins/aion.js, themes/aion.json, bin/aion-init.js"
echo ""
echo "  To create a GitHub Release and attach the tarball:"
echo "    gh release create v$VERSION $TARBALL --target dev --title \"v$VERSION\" --notes \"Release v$VERSION\""
