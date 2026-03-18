---
name: review
description: Pre-PR code review for Ghosted. Checks for node-pty leaks, IPC safety, React cleanup, and pane lifecycle correctness.
---

# /review — Ghosted Code Review

Run before any PR. Find real bugs, not style issues.

## Run first
```bash
npm run lint
npm run build
```
If either fails — stop, fix, don't continue.

## Critical checks

### node-pty leaks (most common bug in Ghosted)
- [ ] Every `pty:create` has a matching `pty:kill` in useEffect cleanup
- [ ] PTY IPC listeners (`pty:data:{id}`, `pty:exit:{id}`) removed on cleanup
- [ ] `terminals` Map in `electron/main.ts` cleaned up on kill — no zombie entries
- [ ] What happens if the renderer is reloaded without killing PTYs?

### IPC safety
- [ ] Every IPC handler in `electron/main.ts` validates its arguments before use
- [ ] No `shell.openExternal` with user-supplied URLs without validation
- [ ] File paths from renderer are not used unsanitized — check for path traversal
- [ ] `contextIsolation: true` and `nodeIntegration: false` still set in `createWindow`

### React lifecycle
- [ ] All useEffect hooks that set up subscriptions have cleanup returns
- [ ] No state updates after unmount (check async operations)
- [ ] Monaco editor instances disposed on tab close
- [ ] xterm.js Terminal instances disposed on unmount/cleanup
- [ ] reagraph and xyflow listeners cleaned up

### Pane always-mounted pattern
- [ ] New panes use CSS hide/show, NOT conditional rendering (`{isVisible && <Pane/>}`)
- [ ] State that must survive pane switches is in Zustand or a ref, not local state
- [ ] Pane containers have correct dimensions when becoming visible (FitAddon issue)

### File system
- [ ] `fs:writefile` only called on explicit user save action (Cmd+S)
- [ ] Unsaved changes tracked via `isDirty` in store — user warned before close
- [ ] Large files handled gracefully — Monaco has limits

### TypeScript
- [ ] IPC types in `src/types/electron.d.ts` match actual implementations in preload + main
- [ ] No `as any` without comment explaining why

## Output
```
CRITICAL: <issue> — <file>:<line> — <why>
HIGH: <issue> — <file>:<line> — <why>
MEDIUM: <issue> — <file>:<line>
PASS: <area> — no issues
```
Fix CRITICAL and HIGH before any PR.
