---
name: get-api-docs
description: Use this skill when writing code against any external library in Ghosted — Monaco, xterm.js, reagraph, xyflow, dnd-kit, node-pty, react-arborist, Electron APIs. Fetch docs with chub before coding, not after.
---

# Get API Docs via chub

Ghosted uses several libraries with complex, frequently-changing APIs. Always fetch current docs before writing integration code.

## Step 1 — Search
```bash
chub search "<library name>"
```

## Step 2 — Fetch
```bash
chub get <id> --lang js
```

## Step 3 — Annotate discoveries
```bash
chub annotate <id> "<gotcha or workaround>"
```

## Ghosted-specific library notes

These are in chub or Context7 — fetch before using:

| Library | Notes |
|---|---|
| `@monaco-editor/react` | Check chub. API stable but theme/language config is fiddly |
| `@xyflow/react` | v12 changed API significantly from v11 — always fetch |
| `reagraph` | Small community, docs sparse — check chub + Context7 |
| `xterm` / `@xterm/*` | xterm.js v5 changed addon import paths |
| `node-pty` | Native module — check Electron compatibility matrix |
| `dnd-kit` | Multiple packages (`core`, `sortable`, `utilities`) — fetch all |
| `react-arborist` | Check chub — uses react-window internally |
| `@octokit/graphql` | GitHub Projects v2 GraphQL schema — check chub |

## For Electron APIs
Context7 has current Electron docs. Use it directly:
- "How does contextBridge.exposeInMainWorld work in Electron 29?"
- "Electron ipcMain.handle vs ipcMain.on"
- "node-pty Electron compatibility"

## Fallback
If chub and Context7 both come up empty — check the library's GitHub releases page for breaking changes before assuming training knowledge is correct.
