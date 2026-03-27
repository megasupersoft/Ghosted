---
project: Ghosted
updated: 2026-03-27
---

# Ghosted Progress

## Current status
v0.1.2 — Portal pane pool, live file updates, markdown/JSON preview, canvas undo, explorer drag-drop, file persistence.

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
- [x] Portal pane pool — panels survive splits/moves/rearrangements without losing state
- [x] Live file updates — open tabs auto-reload when files change on disk
- [x] Markdown preview toggle for .md/.mdx files
- [x] JSON tree viewer matching explorer style
- [x] Canvas undo/redo (Cmd+Z/Shift+Z), dirty indicator, Cmd+S save
- [x] Explorer: context menu rename/delete, keyboard delete, drag-drop, copy/paste, undo
- [x] Open files persisted across app restarts
- [x] Dirty dot indicator on tabs with unsaved changes
- [x] node-pty spawn-helper asar path fix for packaged builds

## In Flight
- [ ] Canvas JSON export/import
- [ ] Graph search + depth control
- [ ] pi.dev RPC integration in terminal pane
- [ ] `ghosted .` CLI launcher
- [ ] BruceOS AppImage packaging

## Blockers
None currently

## Notes
Update this file at the end of every session.
