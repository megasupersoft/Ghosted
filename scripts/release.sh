#!/usr/bin/env bash
set -euo pipefail

# ── Ghosted Release Script ──────────────────────────────────────────────────
# One command: npm run release
# Builds, packages, tags, pushes, and creates a GitHub release with the DMG.
# Reads version from package.json so everything stays in sync.
# ─────────────────────────────────────────────────────────────────────────────

cd "$(dirname "$0")/.."

# ── Read version from package.json ──────────────────────────────────────────
VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"
PRODUCT="Ghosted"

# ── Detect platform ─────────────────────────────────────────────────────────
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64)  PLATFORM="mac"; ARCH="arm64"; ARTIFACT="release/${PRODUCT}-${VERSION}-arm64.dmg" ;;
  Darwin-x86_64) PLATFORM="mac"; ARCH="x64";   ARTIFACT="release/${PRODUCT}-${VERSION}.dmg" ;;
  Linux-x86_64)  PLATFORM="linux"; ARCH="x64";  ARTIFACT="release/${PRODUCT}-${VERSION}.AppImage" ;;
  Linux-aarch64) PLATFORM="linux"; ARCH="arm64"; ARTIFACT="release/${PRODUCT}-${VERSION}-arm64.AppImage" ;;
  *)             echo "Unsupported platform: $(uname -s)-$(uname -m)"; exit 1 ;;
esac

echo "═══════════════════════════════════════════════════════════"
echo "  ${PRODUCT} ${TAG} — ${PLATFORM} ${ARCH}"
echo "═══════════════════════════════════════════════════════════"

# ── Preflight checks ───────────────────────────────────────────────────────
echo ""
echo "▶ Preflight checks..."

if ! command -v gh &>/dev/null; then
  echo "  ✗ gh CLI not found — install with: brew install gh"; exit 1
fi

if ! gh auth status &>/dev/null; then
  echo "  ✗ gh not authenticated — run: gh auth login"; exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "  ✗ Working tree is dirty — commit or stash first"
  git status --short
  exit 1
fi

if git rev-parse "$TAG" &>/dev/null; then
  echo "  ✗ Tag ${TAG} already exists — bump version in package.json first"
  exit 1
fi

echo "  ✓ All checks passed"

# ── Build ───────────────────────────────────────────────────────────────────
echo ""
echo "▶ Building..."
npm run build

# ── Package ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Packaging ${PLATFORM}..."
npx electron-builder --${PLATFORM}

if [ ! -f "$ARTIFACT" ]; then
  echo "  ✗ Expected artifact not found: ${ARTIFACT}"
  echo "  Available files in release/:"
  ls -1 release/
  exit 1
fi

SIZE=$(du -h "$ARTIFACT" | cut -f1 | xargs)
echo "  ✓ ${ARTIFACT} (${SIZE})"

# ── Tag and push ────────────────────────────────────────────────────────────
echo ""
echo "▶ Pushing and tagging..."
git push origin main
git tag "$TAG"
git push origin "$TAG"

# ── Create GitHub release ───────────────────────────────────────────────────
echo ""
echo "▶ Creating GitHub release..."
gh release create "$TAG" "$ARTIFACT" \
  --title "${PRODUCT} ${TAG}" \
  --generate-notes \
  --latest

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  ✓ ${PRODUCT} ${TAG} shipped!"
echo "═══════════════════════════════════════════════════════════"
