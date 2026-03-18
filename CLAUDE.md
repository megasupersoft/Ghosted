---
project: Ghosted
type: software
status: active
version: 0.1.0
stack: Electron 29, Vite 5, React 18, TypeScript, Zustand, Monaco, xterm.js, node-pty, reagraph, xyflow, dnd-kit
company: Megasupersoft Ltd
github_org: megasupersoft
github_project: 5
---

# Ghosted — Claude Instructions

## MANDATORY WORKFLOW — DO NOT SKIP

### Starting a session
1. Read `PROGRESS.md` if it exists — know what's in flight
2. Check GitHub Projects: `gh project item-list 5 --owner megasupersoft --format json`
3. Confirm what we're working on today

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
2. Fix all CRITICAL and HIGH before proceeding

### To ship
1. `/ship` — version bump, build, tag, push, update GitHub Projects

### Automatic checks
- New pane? → `/arch` first — IPC, store slice, mount/unmount lifecycle
- Touching IPC? → Update `electron/main.ts` AND `electron/preload.ts` AND `src/types/electron.d.ts` together
- New terminal instance? → Must have cleanup in useEffect return — node-pty leaks are real
- New native dependency? → `npm rebuild` required, update BUILDING.md
- Touching reagraph or xyflow? → Fetch docs first, these APIs change constantly

---

## Architecture

### Pane model
Six panes, always mounted, shown/hidden via CSS (not unmounted). This preserves terminal state and graph positions.
- `editor` — Monaco multi-tab + TerminalPane split (default view)
- `terminal` — standalone TerminalPane
- `graph` — reagraph WebGL knowledge graph, scans [[wikilinks]]
- `canvas` — @xyflow/react agent workflow editor
- `kanban` — dnd-kit + GitHub Projects v2 GraphQL
- `filetree` — react-arborist, Electron IPC fs

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
- **reagraph** — WebGL, needs container dimensions set before mount. `[[wikilink]]` scanning is file-content-based.
- **@xyflow/react v12** — ReactFlowProvider required at root. Node/edge state managed outside ReactFlow (in Zustand or local state).
- **dnd-kit** — DndContext at pane root. SortableContext per column.
- **react-arborist** — file tree, lazy loads children on expand. Uses `react-window` internally.

## Commands
```bash
npm install          # install deps
npm rebuild          # REQUIRED after install — compiles node-pty native module
npm run dev          # Vite dev server (renderer only — Electron not launched)
npm run preview      # Launch Electron with built dist
npm run build        # Full build (tsc + vite)
npm run lint         # ESLint
```

## Roadmap
- [ ] `ghosted .` CLI launcher
- [ ] Canvas JSON export/import
- [ ] Graph search + depth control
- [ ] pi.dev RPC in terminal pane
- [ ] BruceOS AppImage packaging
- [ ] Supermemory integration for persistent workspace context

## GitHub Projects
- Org: megasupersoft, Project #5
- `gh project item-list 5 --owner megasupersoft --format json`

## Part of BruceOS
Ghosted ships as the default workspace in BruceOS. Keep AppImage packaging in mind for all build decisions.
