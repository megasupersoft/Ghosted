---
project: Ghosted
type: software
status: active
version: 0.1.0
stack: Electron 43, Vite 8, React 19, TypeScript, Zustand 5, Monaco (bundled), @xterm/xterm 6, node-pty, force-graph, xyflow, dnd-kit, Biome, Vitest, Playwright
company: Megasupersoft Ltd
github_org: megasupersoft
github_project: 5
---

# Ghosted — Claude Instructions

## MANDATORY WORKFLOW — DO NOT SKIP

### Starting a session
1. Read `PROGRESS.md` if it exists — know what's in flight
2. Check GitHub Projects: `gh project item-list 5 --owner megasupersoft --format json`
3. `/verify` if building on prior work — confirm the tree is green before adding to it
4. Confirm what we're working on today

### Before writing code against any external API or library
1. `chub search "<library>"` — check if docs exist
2. If found: `chub get <id> --lang js` — fetch before coding
3. If not found: Context7 MCP is available — use it
4. After: `chub annotate <id> "<gotcha discovered>"`

### Before any new feature or significant change
1. `/brief` — clarify what we're building and why
2. `/arch` — lock pane architecture, IPC contract, state shape
3. Then write code

### Before any PR or release
1. `/review` — bugs, node-pty leaks, IPC safety, React cleanup
2. `/security` — if the change touched IPC, preload, CSP, protocols, or the workspace-grant system
3. Fix all CRITICAL and HIGH before proceeding

### To ship
1. `/ship` — version bump, build, tag, push, update GitHub Projects

### Ending a session
1. `/wrap` — dated PROGRESS.md entry from actual commits + durable learnings to memory

### Other skills
- `/commit` — gated Conventional Commit (lint + typecheck first, never AI attribution)
- `/verify` — full green battery: lint, typecheck, unit, build, e2e
- `/debug` — Electron-aware diagnosis (main vs preload vs renderer, known failure patterns)
- `/shadcn <component>` — add shadcn/ui components correctly (Base UI, token bridge)

### Automatic checks
- New pane? → `/arch` first — IPC, store slice, mount/unmount lifecycle
- Touching IPC? → Update `electron/main.ts` AND `electron/preload.ts` AND `src/types/electron.d.ts` together
- New terminal instance? → Must have cleanup in useEffect return — node-pty leaks are real
- New native dependency? → `npm rebuild` required, update BUILDING.md
- Touching force-graph or xyflow? → Fetch docs first, these APIs change constantly
- All fs/git IPC paths are confined to granted workspace roots (electron/main.ts `assertAllowed`) — new fs handlers MUST validate paths the same way

---

## Architecture

### Pane model
Seven panes, always mounted, shown/hidden via CSS (not unmounted). This preserves terminal state and graph positions.
- `editor` — Monaco multi-tab + TerminalPane split (default view)
- `terminal` — standalone TerminalPane
- `graph` — force-graph canvas knowledge graph, scans [[wikilinks]]
- `canvas` — @xyflow/react agent workflow editor
- `kanban` — Linear-style board on the PM sync engine (electron/projectSync.ts): GitHub Projects v2 two-way sync or local .ghosted/kanban.json; keyboard contract (X/S/C/Enter//)
- `timeline` — roadmap view over Start/Target fields, drag-to-reschedule through the same op queue
- `filetree` — custom tree component (src/panes/FileTree.tsx), Electron IPC fs

Active pane stored in Zustand + localStorage. Never unmount panes — use `display:none` / `visibility:hidden` pattern.

### IPC architecture
All filesystem and PTY operations go through IPC. Renderer never touches Node APIs directly.

| Channel | Direction | Purpose |
|---|---|---|
| `fs:readdir` | invoke | List directory |
| `fs:readfile` | invoke | Read file as utf-8 |
| `fs:writefile` | invoke | Write file |
| `fs:homedir` | invoke | Get home dir |
| `dialog:openFolder` | invoke | Native folder picker |
| `shell:openExternal` | invoke | Open URL in browser |
| `pty:create` | invoke | Spawn PTY shell |
| `pty:write` | invoke | Send input to PTY |
| `pty:resize` | invoke | Resize PTY cols/rows |
| `pty:kill` | invoke | Kill PTY process |
| `pty:data:{id}` | on (push) | PTY output data |
| `pty:exit:{id}` | on (push) | PTY process exited |

### State (Zustand — `src/store/index.ts`)
- `workspacePath` — currently open folder
- `openFiles` — array of `{path, name, content, isDirty}`
- `activeFilePath` — currently focused tab
- `activePane` — which pane is visible
- `paneOrder` — tab order (persisted to localStorage)
- `githubToken` — PAT for Kanban GitHub Projects API

### Key libraries and gotchas
- **Monaco** (`@monaco-editor/react`) — loads async, wrap in Suspense, language detection by file extension
- **xterm.js + node-pty** — PTY lives in main process, xterm in renderer, connected via IPC. Always call `pty:kill` in useEffect cleanup. FitAddon must be called after container is visible.
- **force-graph** — canvas-based, needs container dimensions set before mount. `[[wikilink]]` scanning is file-content-based. Typed via local shim in src/types/force-graph.d.ts (uses private `_destructor()`).
- **@xyflow/react v12** — ReactFlowProvider required at root. Node/edge state managed outside ReactFlow (in Zustand or local state).
- **dnd-kit** — DndContext at pane root. SortableContext per column.
- **Monaco** is bundled locally (src/lib/monacoSetup.ts) — never reintroduce the CDN loader; the CSP allows no remote origins.

## Commands
```bash
npm install          # install deps (postinstall rebuilds node-pty automatically)
npm run dev          # Vite dev server (renderer only — Electron not launched)
npm run preview      # Launch Electron with built dist
npm run build        # typecheck (both tsconfigs) + vite build
npm run typecheck    # tsc renderer + electron, no emit
npm run lint         # Biome (biome.json) — lint:fix to auto-fix + format
npm test             # Vitest unit tests
npm run test:e2e     # Playwright Electron smoke test (needs npm run build first)
```

## Site (docs + landing page)
- Lives in `site/` — VitePress, fully isolated from Electron build
- `cd site && npm install && npm run docs:dev` — local preview
- Auto-deploys to Cloudflare Pages on push to main
- `/publish` — manual deploy via wrangler
- Cloudflare Pages config: root `site`, build `npm run docs:build`, output `.vitepress/dist`

## Roadmap
- [x] `ghosted .` CLI launcher (bin/ghosted + single-instance handoff; palette: "Install ghosted CLI")
- [x] Canvas JSON export/import — JSON Canvas 1.0 spec interop (jsoncanvas.org), Obsidian-compatible
- [x] Graph search + depth control — live match highlighting, focus root via click/Enter, BFS depth 1/2/3/all local view
- [x] pi.dev RPC in terminal pane — GHOSTED_SOCKET JSON-RPC (openFile/switchPane/notify/workspaces), `ghosted open <file>`
- [ ] BruceOS AppImage packaging
- [ ] Supermemory integration for persistent workspace context

## GitHub Projects
- Org: megasupersoft, Project #5
- `gh project item-list 5 --owner megasupersoft --format json`

## Part of BruceOS
Ghosted ships as the default workspace in BruceOS. Keep AppImage packaging in mind for all build decisions.
