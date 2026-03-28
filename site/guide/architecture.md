# Architecture

## Pane Model

Ghosted has six panes, all always mounted and shown/hidden via CSS (never unmounted). This preserves terminal state and graph positions across pane switches.

| Pane | Description |
|---|---|
| **Editor** | Monaco multi-tab + TerminalPane split (default view) |
| **Terminal** | Standalone TerminalPane |
| **Graph** | Force-directed WebGL knowledge graph, scans `[[wikilinks]]` |
| **Canvas** | @xyflow/react agent workflow editor |
| **Kanban** | dnd-kit + GitHub Projects v2 GraphQL |
| **File Tree** | react-arborist, Electron IPC filesystem |

Active pane is stored in Zustand + localStorage.

## IPC Architecture

All filesystem and PTY operations go through Electron IPC. The renderer never touches Node APIs directly.

| Channel | Direction | Purpose |
|---|---|---|
| `fs:readdir` | invoke | List directory |
| `fs:readfile` | invoke | Read file as UTF-8 |
| `fs:writefile` | invoke | Write file |
| `fs:homedir` | invoke | Get home directory |
| `dialog:openFolder` | invoke | Native folder picker |
| `shell:openExternal` | invoke | Open URL in browser |
| `pty:create` | invoke | Spawn PTY shell |
| `pty:write` | invoke | Send input to PTY |
| `pty:resize` | invoke | Resize PTY cols/rows |
| `pty:kill` | invoke | Kill PTY process |
| `pty:data:{id}` | on (push) | PTY output data |
| `pty:exit:{id}` | on (push) | PTY process exited |

## State Management

Zustand store at `src/store/index.ts`:

- `workspacePath` — currently open folder
- `openFiles` — array of `{path, name, content, isDirty}`
- `activeFilePath` — currently focused tab
- `activePane` — which pane is visible
- `paneOrder` — tab order (persisted to localStorage)
- `githubToken` — PAT for Kanban GitHub Projects API

## GhostedDB

In-memory markdown index that watches your workspace with chokidar, parses YAML frontmatter with gray-matter, extracts `[[wikilinks]]`, and exposes a query API. The knowledge graph and agent canvas both read from it.
