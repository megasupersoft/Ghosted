---
project: Ghosted
updated: 2026-07-20
---

# Ghosted Progress

## Current status
v0.1.2 + modernization sweep — full 2026 stack (Electron 43, Vite 8, React 19, Zustand 5, @xterm/xterm 6, Tailwind 4), IPC security hardening (workspace-confined fs/git, CSP, safe openExternal), Biome + Vitest + Playwright + CI, ⌘K command palette.

## Modernization sweep (2026-07-20)
- [x] SECURITY: all fs/git/db IPC confined to granted workspace roots (persisted in userData); openExternal scheme allowlist; ghosted-file:// confined + no CSP bypass; production CSP injected at build
- [x] Electron 29→43, Vite 5→8 (Rolldown), React 18→19.2, Zustand 4→5, xterm→@xterm/xterm 6, chokidar 4, electron-builder 26, react-resizable-panels 4 (Group/Separator API)
- [x] Monaco bundled locally (no CDN, works offline); OS file drops via webUtils bridge (File.path removed in Electron 32)
- [x] Removed dead deps (react-arborist, @octokit/graphql, concurrently, nodemon); npm audit 34→18 vulns
- [x] Biome lint+format (replaces broken ESLint), 23 Vitest unit tests (layout tree), Playwright Electron e2e smoke, GitHub Actions CI
- [x] Tailwind 4 foundation with tokens bridged to shadcn-compatible theme; components.json ready for shadcn adds
- [x] ⌘K command palette (cmdk): panes, sidebars, open folder, fuzzy file quick-open via GhostedDB
- [x] Untracked .pi/.serena/scratch files; CLAUDE.md corrected (force-graph, custom FileTree, real commands)

## Modernization follow-ups
- [ ] Split CanvasPane.tsx (~1,300 lines) and FileTree.tsx (~1,050 lines)
- [ ] Migrate 231 inline style objects to Tailwind utilities pane-by-pane
- [ ] shadcn/ui components (Base UI) for dialogs/menus/tooltips
- [ ] Light theme + system tri-state (nativeTheme); OKLCH token pass shared with Monaco/xterm themes
- [ ] Signing + notarization + electron-updater + release matrix (release-please)
- [ ] Sentry crashes + opt-in PostHog analytics
- [ ] Lazy-mount panes on first activation (React 19 <Activity>) for startup time
- [ ] ACP/MCP agent pane on existing PTY + pi infrastructure
- [ ] Packaged-build smoke test (electron-builder 26 + Electron 43 + node-pty pipeline untested)

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
