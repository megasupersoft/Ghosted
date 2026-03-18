---
name: arch
description: Tech lead mode. Run after /brief. Locks pane architecture, IPC contracts, state shape, and lifecycle before writing Ghosted code.
---

# /arch — Ghosted Architecture

Run after `/brief`. Don't write implementation code until this is done.

## 1. Pane lifecycle decision

Ghosted panes are ALWAYS mounted, never unmounted. They use CSS visibility.

For any new pane or major pane change, decide:
- Is this a new pane? → Add to `PaneId` type in `src/store/index.ts`, add to `DEFAULT_PANE_ORDER`, add to `App.tsx` hidden/shown pattern
- Is this a new panel within an existing pane? → Local component state, no store changes needed
- Does it need to survive pane switches? → State must be in Zustand or a ref, not local component state

## 2. IPC contract

For any new IPC channel:
- Add handler in `electron/main.ts` — `ipcMain.handle('channel:name', ...)`
- Add invoke wrapper in `electron/preload.ts` — `contextBridge.exposeInMainWorld`
- Add TypeScript type in `src/types/electron.d.ts`
- ALL THREE must be updated together. Never partially implement IPC.

Document the contract:
```
Channel: name:action
Direction: invoke (renderer→main, returns promise) | on (main→renderer, push)
Args: [type, type]
Returns: type
Error handling: what happens on failure?
```

## 3. State shape

For any new Zustand state:
- Does it need to persist across sessions? → localStorage key in store
- Does it need to survive pane switches? → Zustand (not local state)
- Is it ephemeral UI state? → Local component state is fine
- Is it file-content derived? → Compute from `openFiles`, don't duplicate

Add new state slices to `src/store/index.ts`. Keep the store flat — no nested objects.

## 4. Native module concerns

node-pty is a native module. Rules:
- ALL PTY operations in main process only
- Renderer communicates via IPC exclusively
- `npm rebuild` required after any dependency changes
- Every PTY instance MUST be killed in cleanup — `pty:kill` in useEffect return
- FitAddon.fit() only when container is visible and has dimensions

## 5. reagraph / xyflow concerns

These libraries have non-obvious constraints:
- **reagraph** — container must have explicit dimensions before mount. Data updates must be stable references (useMemo).
- **xyflow v12** — ReactFlowProvider must wrap usage. `useNodesState`/`useEdgesState` or external Zustand — pick one, don't mix. `onNodesChange` / `onEdgesChange` handlers required.

## 6. Failure modes

For every async IPC call:
- What does the UI show while waiting?
- What happens if main process throws?
- What happens if PTY dies unexpectedly?
- What if the workspace folder is deleted while open?

## Output
Write architecture notes as a comment block at the top of the new file, or as a section in `PROGRESS.md`. Draw the data flow. Don't hold it in your head.
