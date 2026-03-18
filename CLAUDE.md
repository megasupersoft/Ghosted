# Ghosted — Dev Workspace

> "Your codebase, haunted."
> Built by Megasupersoft Ltd for BruceOS and beyond.

## What is this
Six-pane agent-native dev workspace. Cursor meets Obsidian, raised in a shed.

## Panes
- **Editor** — Monaco, ghost theme, multi-tab, Cmd+S
- **Terminal** — xterm.js + node-pty, real PTY
- **Graph** — reagraph WebGL, scans [[wikilinks]]
- **Canvas** — @xyflow/react agent workflow editor
- **Kanban** — dnd-kit + GitHub Projects v2 GraphQL
- **File tree** — Electron IPC fs, lazy expand

## Stack
Electron 29 · Vite 5 · React 18 · TypeScript · Zustand

## Dev
```bash
npm install && npm rebuild && npm run dev
```

## IPC
- fs:readdir / fs:readfile / fs:writefile / fs:homedir
- pty:create / pty:write / pty:resize / pty:kill
- pty:data:{id} / pty:exit:{id}
- shell:openExternal

## Roadmap
- [ ] `ghosted .` CLI launcher
- [ ] Canvas JSON export/import
- [ ] Graph search + depth control
- [ ] pi.dev RPC in terminal
- [ ] BruceOS AppImage packaging
