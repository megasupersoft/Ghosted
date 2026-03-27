---
layout: home

hero:
  name: Ghosted
  text: One window. Everything mounted. Nothing lost.
  tagline: Editor, terminal, knowledge graph, agent canvas, kanban, file tree. Six panes that stay alive when you switch between them. No tab graveyard. No state resets. Just your whole workflow, always ready.
  image:
    light: /ghosted-icon-light.svg
    dark: /ghosted-icon-dark.svg
    alt: Ghosted
  actions:
    - theme: alt
      text: How It Works
      link: /guide/getting-started

features:
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>'
    title: Editor
    details: Monaco editor with a custom spectral theme. Multi-tab, instant save, image and video preview. Your files, not a web app pretending to be local.
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/></svg>'
    title: Terminal
    details: A real PTY, not a fake. node-pty in the main process, xterm.js in the renderer. Resize, clickable links, 256-color. Split it, stack it, keep it running.
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>'
    title: Knowledge Graph
    details: Drop [[wikilinks]] in your notes. Ghosted builds a force-directed WebGL graph of how your files connect. See the shape of your project.
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/></svg>'
    title: Agent Canvas
    details: Wire up prompt nodes, terminal nodes, context nodes. Drag connections between them. Run the pipeline. It's a visual agent builder, not a flowchart.
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>'
    title: Kanban
    details: Talks to GitHub Projects v2 over GraphQL. Your columns are your Status field. Drag cards around, it syncs. No third-party board app needed.
  - icon: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2.5a1 1 0 0 1-.8-.4l-.9-1.2A1 1 0 0 0 15 3h-2a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1Z"/><path d="M20 21a1 1 0 0 0 1-1v-3a1 1 0 0 0-1-1h-2.9a1 1 0 0 1-.88-.55l-.42-.85a1 1 0 0 0-.88-.55H13a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1Z"/><path d="M3 3v2"/><path d="M3 3h7"/><path d="M3 15h5"/><path d="M3 8v7"/></svg>'
    title: File Tree
    details: Create, rename, delete, drag-drop, copy-paste, undo. Lazy-loaded so it doesn't choke on big repos. Right-click does what you'd expect.
---
