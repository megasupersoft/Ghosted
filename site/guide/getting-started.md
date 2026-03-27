# Getting Started

Ghosted is an Electron workspace with six panes: editor, terminal, knowledge graph, agent canvas, kanban, and file tree. All of them stay mounted all the time. Switch panes, come back, your terminal scrollback is still there. Your graph didn't re-layout. Your editor tabs didn't close.

That's the whole idea. One window, nothing gets reset.

Built by [Megasupersoft](https://megasupersoft.com). Ships as the default workspace in [BruceOS](https://bruceos.com). MIT licensed.

## Install

Grab a release from GitHub:

**[Latest release](https://github.com/megasupersoft/Ghosted/releases/latest)**

| Platform | Format |
|---|---|
| macOS (Apple Silicon) | `.dmg` |
| Linux x86_64 | `.AppImage` |
| Windows | `.exe` (NSIS) |

### Linux

```bash
chmod +x Ghosted-*.AppImage
./Ghosted-*.AppImage
```

No dependencies. It's an AppImage.

## Build from source

```bash
git clone https://github.com/megasupersoft/Ghosted.git
cd Ghosted
npm install
npm rebuild        # builds the node-pty native module — don't skip this
npm run dev        # vite dev server (renderer only, no Electron)
npm run preview    # full Electron window with the built app
```

You'll need:
- Node 18+
- Python 3 (node-gyp needs it)
- C++ build tools (`build-essential` on Linux, Xcode CLI tools on macOS)

::: tip node-pty is picky
If `npm rebuild` fails, it's almost always a missing C++ toolchain or a glibc mismatch. Check the [node-pty docs](https://github.com/nicknisi/node-pty#dependencies) for your platform.
:::

## Open a workspace

Launch Ghosted. Click the folder icon top-left, or drag a folder onto the window. All six panes now operate on that directory.

There's no "project file" or config to create. Point it at a folder and go.

## What's next

- **[Architecture](/guide/architecture)** -- how the pane model and IPC work under the hood
- **[Panes](/guide/panes)** -- what each pane does and how to use it
- **[Contributing](/guide/contributing)** -- want to hack on Ghosted? Start here
