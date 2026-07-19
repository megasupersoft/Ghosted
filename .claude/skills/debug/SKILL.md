---
name: debug
description: Diagnose and fix what's broken in Ghosted. Use when the user says "something's broken", "sort it out", "fix this", or reports a crash/blank window/dead terminal. Electron-aware — separates main-process, preload, and renderer failures before touching code.
---

# /debug — Ghosted diagnosis

State the root cause before touching code. Minimal fix, then `/verify`.

## 1. Which process is failing?

Launch with logs captured and read them:

```bash
npx electron . > /tmp/ghosted-debug.log 2>&1 &
sleep 8 && grep -viE "coretext|imk" /tmp/ghosted-debug.log | head -30
```

- **Main process** errors appear in that log (IPC handlers, node-pty, ghostdb, pi sessions).
- **Renderer** errors need DevTools: relaunch with `npx electron . --remote-debugging-port=9222` and inspect via Chrome DevTools MCP, or temporarily add `win.webContents.openDevTools()`.
- **Preload** failures usually surface as `window.electron is undefined` in the renderer.

## 2. Known failure patterns (check these first)

| Symptom | Likely cause |
|---|---|
| Terminal dead, "posix_spawnp failed" | node-pty spawn-helper missing exec bit or asar path bug → `node scripts/rebuild-pty.js`; packaged builds: see memory `feedback_nodepty_asar_path_bug` |
| node-pty load failed after dep change | ABI mismatch with Electron's Node → `node scripts/rebuild-pty.js` |
| "Access denied: path is outside granted workspace roots" | Workspace-confinement doing its job — the renderer touched a path outside granted roots. If it's a legit flow, the grant is missing (`workspace:restore` on boot, `dialog:openFolder`, or the `fileDrop` bridge) — do NOT weaken `assertAllowed` |
| Blank window in packaged/preview | Stale `dist/` → `npm run build`; or CSP blocking a new remote/inline resource — check DevTools console |
| Images/videos not rendering in editor | `ghosted-file://` path outside granted roots (403) |
| Pane state lost on switch | Something unmounted a pane — panes must stay mounted (PanePool portal pattern) |
| xterm sized wrong / invisible | FitAddon called before container had dimensions |

## 3. Root cause → fix → verify

1. State the root cause in one sentence before editing.
2. Minimal change to resolve — no drive-by refactors.
3. Run `/verify` (or at minimum the failing path).
4. If this is a new reusable pattern, add it to the table above and/or project memory.
