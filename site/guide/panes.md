# Panes

Every pane in Ghosted stays mounted at all times. Switching panes toggles CSS visibility — terminal scrollback, graph layout, and editor state are never lost.

## Editor

Monaco editor with a custom ghost theme. Supports multi-tab editing with dirty-file indicators, syntax highlighting for 50+ languages, image and video preview, and `Cmd+S` / `Ctrl+S` save through Electron IPC.

Split the editor vertically to get a terminal alongside your code.

## Terminal

Real PTY shell powered by xterm.js in the renderer and node-pty in the main process, connected via IPC. Features:

- Full resize support (FitAddon)
- Clickable web links (WebLinksAddon)
- 256-color output
- Multiple terminals across split panes

## Knowledge Graph

Force-directed WebGL graph that scans your workspace for `[[wikilinks]]` and file import relationships. Nodes represent files; edges represent links between them. Powered by force-graph with WebGL rendering for performance on large workspaces.

## Agent Canvas

Visual workflow editor built on @xyflow/react v12. Drag nodes onto the canvas and connect them to build executable pipelines:

- **Prompt** nodes — define LLM instructions
- **Skill** nodes — reusable operations
- **Context** nodes — query GhostedDB for workspace knowledge
- **Terminal** nodes — run shell commands
- **Output** nodes — collect results

Canvas state persists to JSON and supports undo/redo.

## Kanban

Drag-and-drop board synced to GitHub Projects v2 via the GraphQL API. Columns map to your project's Status field. Cards show title, assignee, and labels.

Requires a GitHub token with `project` scope — set it in Ghosted's settings.

## File Tree

Lazy-loaded file explorer powered by react-arborist over Electron IPC. Supports:

- Create, rename, and delete files/folders
- Drag-and-drop to move
- Copy and paste
- Undo operations
- Click to open in editor
