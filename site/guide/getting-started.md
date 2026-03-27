# Getting Started

Ghosted is an opinionated developer workspace that combines a code editor, terminal, knowledge graph, agent workflow canvas, Kanban board, and file tree into a single window. Every pane stays mounted — terminal scrollback, graph positions, and editor state persist across pane switches.

Built by [Megasupersoft Ltd](https://megasupersoft.com). Ships as the default workspace in [BruceOS](https://bruceos.com).

## Download

Grab the latest release for your platform:

| Platform | Format |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| Linux (x86_64) | `.AppImage` |
| Windows | `.exe` (NSIS installer) |

**[Download latest release](https://github.com/megasupersoft/Ghosted/releases/latest)**

## Running the AppImage (Linux)

```bash
chmod +x Ghosted-*.AppImage
./Ghosted-*.AppImage
```

## Building from Source

```bash
git clone https://github.com/megasupersoft/Ghosted.git
cd Ghosted
npm install
npm rebuild          # compiles node-pty native module
npm run dev          # Vite dev server (renderer only)
npm run preview      # launch Electron with built dist
```

### Requirements

- Node.js 18+
- Python 3 (for node-gyp)
- C++ build tools (`build-essential` on Linux, Xcode CLI on macOS)

## Opening a Workspace

Launch Ghosted, then use the folder picker (top-left) or drag a folder onto the window. All panes operate on the selected workspace directory.
