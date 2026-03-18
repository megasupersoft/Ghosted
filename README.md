# 👻 Ghosted

> The dev workspace that never sleeps.

Agent-native. Dark. Opinionated. Built by [Megasupersoft Ltd](https://megasupersoft.com) for [BruceOS](https://bruceos.com) and anywhere else you want to summon it.

---

## Panes

| | Pane | Powered by |
|--|------|-----------|
| ⌨ | Editor | Monaco (custom ghost theme) |
| _ | Terminal | xterm.js + node-pty |
| ◈ | Knowledge graph | reagraph (WebGL) |
| ⬡ | Agent canvas | @xyflow/react v12 |
| ▦ | Kanban | dnd-kit + GitHub Projects v2 |
| 📁 | File tree | Electron IPC + fs |

## Getting started

```bash
npm install
npm rebuild          # native modules (node-pty)
npm run dev          # hot-reload dev mode
```

## GitHub Kanban
Enter a PAT with `project` scope and `owner/repo` in the Kanban toolbar.
Maps GitHub Projects v2 items to columns by Status field.

## Design
Colour palette: `src/styles/global.css`
Accent: `#8b7cf8` — cold spectral violet.

## Part of BruceOS
Ghosted ships as the default workspace in [BruceOS](https://bruceos.com).

---
*"Your codebase, haunted."*
