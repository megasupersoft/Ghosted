---
name: brief
description: Creative director mode. Run before starting any new feature. Forces clarity on what we're actually building in Ghosted before touching code.
---

# /brief — Ghosted Feature Brief

Run before writing any code. Make sure we're building the right thing.

## Questions to answer

### 1. Which pane(s) does this affect?
Editor / Terminal / Graph / Canvas / Kanban / FileTree — or is this cross-cutting?

### 2. What's the real job to be done?
- Who uses this? Developer using Ghosted as their workspace? Agent using Ghosted as its IDE?
- What are they doing today without this feature?
- What breaks if we get it wrong?

### 3. What's the 10x version?
Ghosted is agent-native. Most features should work for both humans AND agents running in the terminal.
- Can pi.dev or Claude Code drive this feature programmatically?
- Does it make the agent's context better (graph, canvas) or just nicer for humans?

### 4. IPC impact?
- Does this need new IPC channels? → `/arch` must design them before coding
- Does this read/write the filesystem? → Goes through `fs:*` IPC, never direct
- Does this spawn processes? → Goes through `pty:*` IPC, never direct

### 5. Scope and done-when
- What's the minimum version that's actually useful?
- What's explicitly out of scope this iteration?
- How do we know it's done? (specific, testable)

## Output
Write a brief entry in `PROGRESS.md` under "In Flight":
```
### [Feature]
- **Job**: [one sentence]
- **Panes**: [which panes]
- **IPC**: [new channels needed or none]
- **Done when**: [testable criteria]
```
Only proceed to `/arch` after this is written.
