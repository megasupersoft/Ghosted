---
name: commit
description: Use when the user asks to commit, save work, or finalize changes. Stages files, gates on lint + typecheck, writes a Conventional Commit with no AI attribution, and commits. Does not push.
allowed-tools: Bash(git:*) Bash(npm:*) Bash(npx:*) Read
---

# /commit — Ghosted commit

## Staged diff
!`git diff --staged --stat`

## Unstaged
!`git status --short`

## Instructions

1. If nothing is staged, `git add -A` and re-check. Never stage `release/`, `dist/`, `dist-electron/`, `.pi/`, `.serena/` (gitignored, but check).
2. Gate: run `npm run lint` and `npm run typecheck`. If either fails, stop and surface the errors — offer `npm run lint:fix` for fixables.
3. If the change touched IPC, confirm all three moved together: `electron/main.ts`, `electron/preload.ts`, `src/types/electron.d.ts` (CLAUDE.md rule). New fs handlers must use `assertAllowed`/`isAllowedPath`.
4. Compose ONE Conventional Commit message. Type ∈ {feat, fix, chore, refactor, docs, test, build, ci, perf, security, deps, tooling}. Subject ≤ 72 chars, imperative. Body only if non-trivial.
5. **No Co-Authored-By, no "Generated with", no AI attribution — ever** (standing project rule).
6. Commit, then print `git log -1 --oneline`. Do NOT push unless the user asks.
