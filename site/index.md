---
layout: home

hero:
  name: Ghosted
  text: The dev workspace that never sleeps.
  tagline: Six always-mounted panes. Built-in knowledge graph. Agent workflow canvas. One window.
  image:
    src: /ghosted-icon.png
    alt: Ghosted
  actions:
    - theme: brand
      text: Download
      link: https://github.com/megasupersoft/Ghosted/releases/latest
    - theme: alt
      text: Read the Docs
      link: /guide/getting-started

features:
  - icon: "\u270F\uFE0F"
    title: Editor
    details: Monaco with a custom ghost theme, multi-tab editing, image/video preview, and instant save through Electron IPC.
  - icon: "\u25B6\uFE0F"
    title: Terminal
    details: Real PTY shell via xterm.js + node-pty. Resize, web links, 256-color, multiple terminals across split panes.
  - icon: "\uD83D\uDD78\uFE0F"
    title: Knowledge Graph
    details: Force-directed WebGL graph scanning your workspace for [[wikilinks]] and import relationships.
  - icon: "\u26A1"
    title: Agent Canvas
    details: Visual workflow editor on @xyflow/react. Chain prompt, skill, context, and terminal nodes into executable pipelines.
  - icon: "\uD83D\uDCCB"
    title: Kanban
    details: Drag-and-drop board synced to GitHub Projects v2 via GraphQL. Columns map to your project's Status field.
  - icon: "\uD83D\uDCC2"
    title: File Tree
    details: Lazy-loaded explorer with create, rename, delete, drag-drop, copy-paste, and undo. Powered by react-arborist.
---
