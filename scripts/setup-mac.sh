#!/bin/bash
# Patches the Electron dev binary on macOS so the dock and menu bar
# show "Ghosted" with our custom icon instead of "Electron".
set -e

if [[ "$(uname)" != "Darwin" ]]; then
  echo "Not macOS, skipping"
  exit 0
fi

ELECTRON_APP="node_modules/electron/dist/Electron.app"
PLIST="$ELECTRON_APP/Contents/Info.plist"
RESOURCES="$ELECTRON_APP/Contents/Resources"

if [[ ! -f "$PLIST" ]]; then
  echo "Electron.app not found — run npm install first"
  exit 0
fi

echo "Patching Electron.app for Ghosted..."

# ── 1. Fix app name in plist ──
plutil -replace CFBundleName -string "Ghosted" "$PLIST"
plutil -replace CFBundleDisplayName -string "Ghosted" "$PLIST"
echo "  Name → Ghosted"

# ── 2. Render SVG icon to PNGs using Swift (always available on macOS) ──
ICON_SVG="$(cd "$(dirname "$0")/.." && pwd)/build/icon.svg"
if [[ ! -f "$ICON_SVG" ]]; then
  echo "  build/icon.svg not found, skipping icon"
  exit 0
fi

WORK="$(mktemp -d)"
ICONSET="$WORK/Ghosted.iconset"
mkdir -p "$ICONSET"

# Inline Swift script — uses AppKit to rasterize SVG at any size
SWIFT_RENDER=$(cat <<'SWIFT'
import AppKit
let args = CommandLine.arguments
guard args.count == 4,
      let size = Int(args[3]),
      let data = try? Data(contentsOf: URL(fileURLWithPath: args[1])),
      let image = NSImage(data: data) else { exit(1) }
let target = NSSize(width: size, height: size)
guard let bitmap = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
  bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
) else { exit(1) }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
image.draw(in: NSRect(origin: .zero, size: target))
NSGraphicsContext.restoreGraphicsState()
guard let png = bitmap.representation(using: .png, properties: [:]) else { exit(1) }
try! png.write(to: URL(fileURLWithPath: args[2]))
SWIFT
)

render_png() {
  local size=$1 name=$2
  swift -e "$SWIFT_RENDER" "$ICON_SVG" "$ICONSET/$name" "$size"
}

render_png 16   "icon_16x16.png"
render_png 32   "icon_16x16@2x.png"
render_png 32   "icon_32x32.png"
render_png 64   "icon_32x32@2x.png"
render_png 128  "icon_128x128.png"
render_png 256  "icon_128x128@2x.png"
render_png 256  "icon_256x256.png"
render_png 512  "icon_256x256@2x.png"
render_png 512  "icon_512x512.png"
render_png 1024 "icon_512x512@2x.png"

# ── 3. Convert iconset → icns and install ──
iconutil --convert icns "$ICONSET" --output "$RESOURCES/electron.icns"
echo "  Icon → electron.icns replaced"

# Also save a PNG copy for BrowserWindow icon fallback
cp "$ICONSET/icon_256x256.png" "$(dirname "$0")/../build/icon.png"
echo "  PNG  → build/icon.png"

rm -rf "$WORK"
echo "Done — restart Electron to see changes."
