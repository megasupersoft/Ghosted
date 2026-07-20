---
project: Ghosted
updated: 2026-07-20
---

# Ghosted Progress

## Current status
v0.1.2 + modernized stack + feature wave: `ghosted .` CLI with single-instance handoff, JSON Canvas 1.0 export/import, graph search + depth control, terminal RPC socket, and the PM suite — GitHub Projects v2 sync engine (optimistic op queue, adaptive polling), Linear-style kanban with keyboard contract + local offline board, roadmap timeline pane. Settings is a pane tab. 77 unit tests + 17 e2e green on macOS and Linux CI. Verified read-only against real Project #5.

## Session 2026-07-20 (evening)

**Shipped**
- `ghosted .` CLI launcher: bin/ghosted script, single-instance workspace handoff, palette installer, `ghosted open <file>` via RPC
- Canvas JSON Canvas 1.0 export/import (Obsidian-compatible, lossless round-trip via ghosted extension field), save/open file dialog IPC with path grants
- Graph search + depth control: live highlight, focus root, BFS local view (1/2/3/all), node count badge
- Terminal RPC socket (GHOSTED_SOCKET): openFile/switchPane/notify/workspaces for pi.dev and scripts
- PM research (two web sweeps) → PM suite: main-process GitHub Projects v2 sync engine (raw GraphQL, persistent optimistic op queue, change-probe adaptive polling, rate-limit metering); kanban rebuilt with Linear keyboard contract, Triage column, sync affordances, local .ghosted/kanban.json fallback; roadmap timeline pane (8th pane region) with drag-to-reschedule
- Settings moved from sidebar to a pane tab (store openPane focus-or-create)
- Fixes en route: capture-phase Ctrl+K (xterm swallowed it), electron-builder 26 desktop.entry schema, smoke e2e profile isolation
- Suite: 77 unit / 17 e2e, all green; GitHub mode smoke-tested read-only against Project #5

**In flight**
- None — working tree clean

**Blockers**
- electron-builder 26 node-modules collector OOM (noted earlier) still open; packaging deferred until release time

**Next**
- Agent-assignable issues: kanban issue → local pi/Claude Code session via RPC socket, mirrored to GitHub assignee
- Palette-integrated bulk ops + iteration/milestone markers on the timeline
- UI migration continues: shadcn components, inline styles → Tailwind

## Session 2026-07-20 (later)

**Shipped**
- 10-test Playwright regression suite driving the real app: explorer, ⌘K quick-open, Monaco save round-trip, markdown preview, PTY shell round-trip, graph, canvas, kanban, sidebar resize; isolated userData via GHOSTED_USER_DATA env
- Six real bugs the suite caught, fixed: GhostedDB only indexed when canvas mounted; palette passed extension-less filenames; palette values didn't match labels; panels-v4 separators 0px wide + numeric sizes now pixels (sidebar was 18px); Ctrl+K dead with terminal focus on Linux/Windows (xterm swallows it — capture-phase listener); electron-builder 26 linux.desktop schema
- Packaged-build smoke test passed: --mac --dir builds, afterPack node-pty hook works, packaged app boots and PTY round-trips a command, auto-signed with Developer ID
- CI stabilized for Electron on Linux (workers: 1 for ETXTBSY, click vs Enter in cmdk) — green on main

**In flight**
- None — working tree clean, local == origin/main

**Blockers**
- None

**Next**
- Feature work is unblocked — pick from roadmap (canvas JSON export/import, graph search, ghosted CLI launcher)
- UI migration: shadcn components + inline-style → Tailwind pane-by-pane
- Signing/notarization + electron-updater release pipeline

## Session 2026-07-20

**Shipped**
- Full modernization sweep in 4 phases: security hardening, dependency wave, tooling floor, Tailwind 4 + ⌘K palette (details in section below)
- Six project skills added: /wrap, /commit, /verify, /debug, /shadcn, /security — adapted from best variants in other repos, wired into CLAUDE.md workflow
- Project permissions: git push moved from deny to allow in .claude/settings.json
- Rebased onto remote, untracked 59 accidentally-committed VitePress dep-cache artifacts + duplicate root screenshot, pushed everything
- CI green on main twice (49s/51s); checkout/setup-node bumped off deprecated Node 20 runners

**In flight**
- None — working tree clean, local == origin/main

**Blockers**
- None

**Next**
- Packaged-build smoke test (electron-builder 26 + Electron 43 + node-pty pipeline untested since upgrade)
- Start UI migration: shadcn components + inline-style → Tailwind pane-by-pane
- Signing/notarization + electron-updater release pipeline

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
- [x] Packaged-build smoke test (verified: builds, signs, boots, PTY works in package)
- [ ] Packaging deferred until features land — NOTE: electron-builder 26 OOMs in "searching for node modules" on this tree even at 8GB heap (runaway collector traversal; first packaged build worked). Investigate before next release: npm ci tree, collector bug reports, or builder downgrade

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

## Next block: project management features
- [x] GitHub Projects two-way sync — main-process sync engine: raw GraphQL, optimistic persistent op queue, adaptive polling with change probe, rate-limit metering
- [x] Kanban 2026 — Linear keyboard contract, Triage column, sync badges/last-synced, filter, detail modal, local offline board (.ghosted/kanban.json)
- [x] Timeline (roadmap) pane — Month/Quarter/Year zoom, today line, drag/resize bars writing Start/Target dates, unscheduled tray
- [ ] Agent-assignable issues (issue → local pi/Claude session via RPC socket) — the differentiator, next

## In Flight
- [x] Canvas JSON export/import — JSON Canvas 1.0 spec interop (jsoncanvas.org), Obsidian-compatible
- [x] Graph search + depth control — live match highlighting, focus root via click/Enter, BFS depth 1/2/3/all local view
- [x] pi.dev RPC integration in terminal pane — GHOSTED_SOCKET JSON-RPC, `ghosted open <file>`
- [x] `ghosted .` CLI launcher — bin/ghosted script, single-instance lock with workspace handoff, palette installer
- [ ] BruceOS AppImage packaging

## Blockers
None currently

## Notes
Update this file at the end of every session.
