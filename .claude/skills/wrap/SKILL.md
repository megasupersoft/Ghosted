---
name: wrap
description: Wrap up a work session — update PROGRESS.md with a dated section (shipped, in flight, blockers, next) from actual git commits, record durable learnings to project memory, and commit the log. Use when the user says wrap up, end the session, or log what was done.
allowed-tools: Read Edit Write Bash(git:*)
---

# /wrap — Ghosted session wrap

## Recent commits
!`git log -20 --oneline`

## Working tree
!`git status --short`

## Instructions

1. Read `PROGRESS.md` at the repo root.
2. Update the frontmatter `updated:` date to today (absolute YYYY-MM-DD).
3. Rewrite the `## Current status` line if this session changed what the one-line state of the app is.
4. Add a new dated section `## Session YYYY-MM-DD` directly below `## Current status`, newest first. Four sub-headings:
   - **Shipped** — what landed in commits since the last wrap entry (read commit subjects; group related commits into one line each).
   - **In flight** — started but not committed (from the working tree), or "None".
   - **Blockers** — anything preventing progress, or "None".
   - **Next** — the logical next step, 1–3 bullets, based on what shipped and open threads the user named.
5. Terse and factual, one line per item. Do NOT invent work not evidenced by commits or the user's explicit statements. Never modify existing dated sections.
6. **Durable learnings to memory (only if any).** If the session produced a non-obvious decision, gotcha, or convention a future session needs — and it is NOT already in PROGRESS.md, CLAUDE.md, the code, or git history — write it to the project memory dir (`~/.claude/projects/-Users-danger-Github-Ghosted/memory/`) in the standard memory format and index it in `MEMORY.md` there. Update rather than duplicate; most wraps learn nothing durable — skip cleanly when so.
7. Commit PROGRESS.md with message `docs: session wrap YYYY-MM-DD`. **No Co-Authored-By or AI attribution — ever.** Do not push.
