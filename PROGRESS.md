---
project: Ghosted
updated: 2026-03-19
---

# Ghosted Progress

## Current status
v0.1.0 — All six panes scaffolded and rendering. Core IPC (fs + PTY) working.

## Done
- [x] Electron + Vite + React 18 + TypeScript scaffold
- [x] Six-pane layout (editor, terminal, graph, canvas, kanban, filetree)
- [x] Monaco editor — ghost theme, multi-tab, Cmd+S save
- [x] xterm.js + node-pty — real PTY terminal
- [x] reagraph knowledge graph — [[wikilink]] scanning
- [x] @xyflow/react agent canvas
- [x] dnd-kit Kanban + GitHub Projects v2 GraphQL
- [x] react-arborist file tree
- [x] Zustand store — workspace, open files, pane state
- [x] Titlebar with pane switcher
- [x] Always-mounted pane pattern (CSS hide/show, no unmount)
- [x] Folder picker via dialog:openFolder IPC
- [x] PTY shell with resize support
- [x] GhostedDB — in-memory markdown index (chokidar watch, gray-matter, [[wikilink]] extraction)
- [x] useGhostDB hook — auto-indexes workspace, live updates via db:changed
- [x] Canvas pane — context nodes query GhostedDB, workflow runner pipes through topo-sorted nodes
- [x] TypeScript 5.9.3 devDependency fixed, native modules externalized in Vite electron build

## In Flight
### Live file updates + markdown preview + dirty indicator
- **Job**: Open tabs auto-update when files change on disk; markdown preview toggle; unsaved changes dot
- **Panes**: Editor
- **IPC**: None new — uses existing fs:watch/fs:changed
- **Done when**: (1) external edit updates open tab in <1s (2) .md toggle renders markdown (3) dirty dot on unsaved tabs

### Canvas undo stack + dirty indicator
- **Job**: Undo/redo for canvas node/edge operations; dirty dot on tab; Cmd+S save
- **Panes**: Canvas
- **IPC**: None new
- **Done when**: (1) Cmd+Z undoes node/edge changes (2) Cmd+Shift+Z redoes (3) dirty dot on unsaved canvas (4) Cmd+S saves to .canvas file

- [ ] Canvas JSON export/import
- [ ] Graph search + depth control
- [ ] pi.dev RPC integration in terminal pane
- [ ] `ghosted .` CLI launcher
- [ ] BruceOS AppImage packaging

## Blockers
None currently

## Notes
Update this file at the end of every session.
