---
name: build
description: Build and package Ghosted for the current platform (macOS DMG, Linux AppImage, Windows NSIS).
---

# /build — Ghosted Build & Package

Compiles and packages Ghosted for the current platform. Does NOT tag, push, or upload.

## Step 1 — Preflight

```bash
node -p "require('./package.json').version"
uname -s -m
```

Detect platform:
- `Darwin arm64` → mac arm64
- `Darwin x86_64` → mac x64
- `Linux x86_64` → linux x64
- `Linux aarch64` → linux arm64

## Step 2 — Build

```bash
npm run build
```

If build fails → stop immediately.

## Step 3 — Package

Run electron-builder for the detected platform:
- macOS: `npx electron-builder --mac`
- Linux: `npx electron-builder --linux`
- Windows: `npx electron-builder --win`

## Step 4 — Verify

Check that the expected artifact exists:
- macOS arm64: `release/Ghosted-<version>-arm64.dmg`
- macOS x64: `release/Ghosted-<version>.dmg`
- Linux x64: `release/Ghosted-<version>.AppImage`
- Linux arm64: `release/Ghosted-<version>-arm64.AppImage`
- Windows: `release/Ghosted Setup <version>.exe`

Print the artifact path and file size. If missing, list what's in `release/` so user can find it.

## Output

Tell the user: "Build done. Run `/ship` to tag and upload to GitHub Releases."
