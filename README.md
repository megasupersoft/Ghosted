<div align="center">

<img src="build/icon-1024.png" alt="Ghosted" width="128" />

# Ghosted

**The dev workspace that never sleeps.**

An agent-native, dark-mode-only development environment with six always-mounted panes, a built-in knowledge graph, and workflow automation — built on Electron, React, and a cold spectral violet accent.

[![Release](https://img.shields.io/github/v/release/megasupersoft/Ghosted?style=flat-square&color=8b7cf8)](https://github.com/megasupersoft/Ghosted/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-white?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Linux%20%7C%20Windows-white?style=flat-square)]()

</div>

---

<!-- TODO: Replace with actual screenshot once UI is stable -->
<!-- <p align="center"><img src="docs/screenshot.png" alt="Ghosted screenshot" width="960" /></p> -->

## What is Ghosted?

Ghosted is an opinionated developer workspace that combines a code editor, terminal, knowledge graph, agent workflow canvas, Kanban board, and file tree into a single window. Every pane stays mounted — terminal scrollback, graph positions, and editor state persist across pane switches.

Built by [Megasupersoft Ltd](https://megasupersoft.com). Ships as the default workspace in [BruceOS](https://bruceos.com).

## Features

**Editor** — Monaco with a custom ghost theme, multi-tab editing, image/video preview, and Cmd+S save through Electron IPC.

**Terminal** — Real PTY shell via xterm.js + node-pty. Resize support, web links, 256-color. Multiple terminals across split panes.

**Knowledge Graph** — Force-directed WebGL graph that scans your workspace for `[[wikilinks]]` and import relationships. See how your files connect.

**Agent Canvas** — Visual workflow editor built on @xyflow/react v12. Chain prompt, skill, context, terminal, and output nodes into executable pipelines. Context nodes query GhostedDB to inject workspace knowledge.

**Kanban** — Drag-and-drop board synced to GitHub Projects v2 via GraphQL. Columns map to your project's Status field.

**File Tree** — Lazy-loaded file explorer with create, rename, delete, and drag-to-open. Powered by react-arborist over Electron IPC.

**GhostedDB** — In-memory markdown index that watches your workspace with chokidar, parses YAML frontmatter with gray-matter, extracts `[[wikilinks]]`, and exposes a query API. The graph and canvas both read from it.

**Split Layout** — Drag panes into arbitrary split configurations. Tabs within each leaf. Layout persists to localStorage.

**Source Control** — Built-in git integration with staging, commits, push/pull, and branch display.

## Download

Grab the latest release for your platform:

**[Download from GitHub Releases](https://github.com/megasupersoft/Ghosted/releases/latest)**

| Platform | Artifact |
|----------|----------|
| macOS (Apple Silicon) | `Ghosted-x.x.x-arm64.dmg` |
| Linux | `Ghosted-x.x.x.AppImage` |
| Windows | `Ghosted Setup x.x.x.exe` |

## Building from Source

Requires Node.js 18+ and npm.

```bash
git clone https://github.com/megasupersoft/Ghosted.git
cd Ghosted
npm install            # installs deps + rebuilds node-pty for Electron
npm run dev            # Vite dev server + Electron hot-reload
```

### Production build

```bash
npm run build          # TypeScript + Vite production build
npx electron-builder --mac    # or --linux, --win
```

Output lands in `release/`.

> **Note:** Native modules (node-pty) must be compiled on the target platform. You cannot cross-compile a macOS DMG on Linux or vice versa.

### Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies + rebuild native modules |
| `npm run dev` | Vite dev server (hot-reload, localhost:5173) |
| `npm run build` | Production build (tsc + Vite) |
| `npm run preview` | Launch Electron with production build |
| `npm run lint` | ESLint check |

## Architecture

```
electron/
  main.ts          Main process — IPC handlers, PTY, Git, GhostedDB, Pi SDK
  preload.ts       Context bridge — exposes IPC to renderer
  ghostdb.ts       In-memory file index with watcher

src/
  components/      Layout shell — Titlebar, ActivityBar, StatusBar, LayoutRenderer
  panes/           Six pane implementations (always mounted, CSS show/hide)
  store/           Zustand state — workspace, files, layout tree, GhostedDB stats
  lib/             Hooks — useGhostDB
  styles/          Global CSS custom properties (dark theme, accent palette)
  types/           IPC type declarations
```

### Pane Model

All panes are always mounted and shown/hidden via CSS. This preserves terminal state, graph positions, and editor content across switches. Layout is a recursive split tree stored in Zustand and persisted to localStorage.

### IPC

The renderer never touches Node APIs directly. Everything goes through typed IPC channels:

| Namespace | Channels | Purpose |
|-----------|----------|---------|
| `fs:*` | readdir, readfile, writefile, mkdir, rename, delete, watch | Filesystem |
| `pty:*` | create, write, resize, kill, data, exit | Terminal PTY |
| `db:*` | index, query, get, stats, changed | GhostedDB |
| `git:*` | log, status, branch, stage, commit, push, pull | Source control |
| `pi:*` | create, prompt, abort, dispose, event | Agent SDK |

### State

Zustand store at `src/store/index.ts` manages workspace path, open files, layout tree, sidebar state, GhostedDB stats, and status messages. Layout changes persist to localStorage immediately.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron 29 |
| Renderer | React 18, TypeScript 5.9 |
| Bundler | Vite 5, vite-plugin-electron |
| Editor | Monaco (@monaco-editor/react) |
| Terminal | xterm.js + node-pty |
| Graph | force-graph (WebGL) |
| Canvas | @xyflow/react v12 |
| Kanban | dnd-kit + @octokit/graphql |
| File Tree | react-arborist |
| State | Zustand 4 |
| Index | gray-matter + chokidar |
| Packaging | electron-builder |

## GitHub Kanban Setup

1. Generate a GitHub PAT with `project` and `read:org` scopes
2. Enter the token in the Kanban pane toolbar
3. Columns auto-map to your GitHub Projects v2 Status field

## Design

Dark mode only. The colour palette lives in `src/styles/global.css`.

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-base` | `#1e1e28` | Main background |
| `--bg-surface` | `#252532` | Panels, sidebar |
| `--bg-elevated` | `#2e2e3c` | Inputs, cards |
| `--accent` | `#b0a8f0` | Primary accent (spectral violet) |
| `--font-mono` | JetBrains Mono, Fira Code | Code, terminal |
| `--font-ui` | System sans-serif | Interface chrome |

## Contributing

Contributions welcome. Please:

1. Run `/review` (via Claude Code) before opening a PR — checks for node-pty leaks, IPC safety, and React cleanup
2. Follow the IPC contract in CLAUDE.md — touching IPC means updating `main.ts`, `preload.ts`, and `electron.d.ts` together
3. Never unmount panes — use CSS visibility

## Releasing

Ghosted uses Claude Code skills for release management:

| Command | Purpose |
|---------|---------|
| `/build` | Compile + package for current platform |
| `/ship` | Tag, push, upload artifact to GitHub Releases |

Build locally on each target platform, then `/ship` once to publish.

## Roadmap

- [ ] `ghosted .` CLI launcher
- [ ] Canvas JSON export/import
- [ ] Graph search + depth control
- [ ] Pi RPC integration in terminal pane
- [ ] BruceOS AppImage packaging
- [ ] Supermemory integration for persistent workspace context

## License

[MIT](LICENSE)

---

<div align="center">

*Your codebase, haunted.*

Built by [Megasupersoft Ltd](https://megasupersoft.com) for [BruceOS](https://bruceos.com).

</div>
