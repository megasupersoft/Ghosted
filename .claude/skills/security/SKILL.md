---
name: security
description: Electron security audit for Ghosted. Run before any release, or after changes to IPC handlers, the preload bridge, CSP, protocol handlers, or the workspace-grant system. This app runs shells and reads user filesystems — treat renderer compromise as the threat model.
---

# /security — Ghosted security audit

Threat model: untrusted content (markdown, terminal output, opened files) renders in the renderer; assume XSS there is possible and the blast radius must stay inside granted workspace roots.

> `/review` covers correctness and leaks. This is the dedicated security pass. Both gate `/ship`.

## 1. IPC confinement (the load-bearing invariant)

- [ ] Every `fs:*` handler in `electron/main.ts` calls `assertAllowed`/`isAllowedPath` on EVERY renderer-supplied path (src AND dest for rename/copy)
- [ ] Every git/gh handler confines `cwd` via `assertAllowed`
- [ ] `db:index` still validates against `isAllowedPath`
- [ ] No new handler accepts a raw path without confinement (grep `ipcMain.handle` and audit each)
- [ ] `fs:grantDropped` is only reachable via the preload `webUtils` bridge — `ipcRenderer` itself is never exposed to the renderer
- [ ] `workspace:restore` migration path still bounded (existing dir, not home, not fs root, only when granted-roots.json absent)

## 2. Window & protocol hygiene

- [ ] `contextIsolation: true`, `nodeIntegration: false`, sandbox not disabled
- [ ] `ghosted-file://` handler: confined to granted roots, no `bypassCSP` privilege
- [ ] `shell.openExternal` scheme allowlist intact (http/https/mailto only) — terminal WebLinks and markdown links feed it
- [ ] No remote content loaded (only localhost dev server or local dist/)

## 3. CSP

- [ ] Production CSP still injected into built `dist/index.html` (vite.config.ts `injectCsp`)
- [ ] No remote origins added — Monaco stays bundled (never reintroduce the CDN loader)
- [ ] Any new scheme (like `ghosted-file:`) added to the narrowest directive, never `default-src`

## 4. Command execution

- [ ] All exec goes through `execFileSync` with array args, `shell: false` — no `exec`/template-string shell commands anywhere in main
- [ ] PTY spawn is the only intentional shell; its cwd/env exposure is by design (it's a terminal)

## 5. Dependencies & supply chain

```bash
npm audit 2>/dev/null | tail -2
```
- [ ] No new critical/high vulns in production deps
- [ ] New native deps or postinstall scripts reviewed before install

## 6. Secrets

- [ ] No tokens/keys committed (GitHub PAT lives in localStorage via settings, never in repo)
- [ ] `.env*` still gitignored; `git log -p` spot-check on config changes

## Future (flag if still missing at release time)

- Electron fuses (`runAsNode: false`, ASAR integrity) — planned, not yet configured
- Code signing + notarization — required before auto-update ships
