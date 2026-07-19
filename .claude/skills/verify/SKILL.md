---
name: verify
description: Run Ghosted's full green-check battery — lint, typecheck, unit tests, build, Playwright Electron e2e, audit count — and report a PASS/FAIL table. Use at session start, before /review or /ship, or when the user asks "is it green?".
allowed-tools: Bash Read
---

# /verify — Ghosted validation battery

Run every check in order. Report a table: check → PASS/FAIL → key numbers. If a check fails, stop after the table and surface the exact failures — nothing ships on red.

## 1. Lint
```bash
npm run lint
```

## 2. Types (renderer + electron)
```bash
npm run typecheck
```

## 3. Unit tests
```bash
npm test
```

## 4. Build (produces dist/ the e2e needs)
```bash
npx vite build 2>&1 | tail -5
```

## 5. E2E smoke (boots real Electron app, exercises ⌘K palette)
```bash
npm run test:e2e
```

## 6. Dependency audit (informational — report count, don't fail)
```bash
npm audit 2>/dev/null | tail -2
```

## Notes
- e2e failing with a blank window usually means dist/ is stale — rebuild first.
- node-pty load failures after an Electron upgrade → `node scripts/rebuild-pty.js`.
- Give the e2e up to 2 minutes; first run downloads the Electron binary on fresh installs.
