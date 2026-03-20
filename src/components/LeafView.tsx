import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { LeafNode, PaneId, DropZone, TabEntry, countLeaves, getActiveTab } from '@/store/layout'
import {
  Code, Terminal, Share2, Workflow, Kanban, Bot,
  PanelRight, PanelBottom, X, Plus, Pin,
} from 'lucide-react'

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'avif']
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'ogg']

const TAB_ICON_SIZE = 16

const PANE_ICONS: Record<PaneId, React.ReactNode> = {
  editor:   <Code size={TAB_ICON_SIZE} />,
  terminal: <Terminal size={TAB_ICON_SIZE} />,
  graph:    <Share2 size={TAB_ICON_SIZE} />,
  canvas:   <Workflow size={TAB_ICON_SIZE} />,
  kanban:   <Kanban size={TAB_ICON_SIZE} />,
  ai:       <Bot size={TAB_ICON_SIZE} />,
}

const PANE_LABELS: Record<PaneId, string> = {
  editor: 'Editor',
  terminal: 'Terminal',
  graph: 'Graph',
  canvas: 'Canvas',
  kanban: 'Kanban',
  ai: 'Pi',
}

const ALL_PANES: PaneId[] = ['editor', 'terminal', 'graph', 'canvas', 'kanban', 'ai']

// Lazy-load pane components
const EditorPane = React.lazy(() => import('@/panes/EditorPane'))
const TerminalPane = React.lazy(() => import('@/panes/TerminalPane'))
const GraphPane = React.lazy(() => import('@/panes/GraphPane'))
const CanvasPane = React.lazy(() => import('@/panes/CanvasPane'))
const KanbanPane = React.lazy(() => import('@/panes/KanbanPane'))
const AiPane = React.lazy(() => import('@/panes/AiPane'))

// --- Drop zone detection (Obsidian's 33% threshold algorithm) ---

const EDGE_THRESHOLD = 0.33

function getDropZone(e: React.DragEvent, rect: DOMRect): DropZone {
  const x = (e.clientX - rect.left) / rect.width
  const y = (e.clientY - rect.top) / rect.height

  const fromLeft = x
  const fromRight = 1 - x
  const fromTop = y
  const fromBottom = 1 - y
  const minEdge = Math.min(fromLeft, fromRight, fromTop, fromBottom)

  if (minEdge > EDGE_THRESHOLD) return 'center'
  if (minEdge === fromLeft) return 'left'
  if (minEdge === fromRight) return 'right'
  if (minEdge === fromTop) return 'top'
  return 'bottom'
}

// --- Overlay positioning per drop zone ---

function getOverlayStyle(zone: DropZone): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    borderRadius: 'var(--radius-sm)',
    pointerEvents: 'none',
    zIndex: 50,
  }
  switch (zone) {
    case 'left':   return { ...base, top: 3, bottom: 3, left: 3, right: '50%' }
    case 'right':  return { ...base, top: 3, bottom: 3, left: '50%', right: 3 }
    case 'top':    return { ...base, top: 3, bottom: '50%', left: 3, right: 3 }
    case 'bottom': return { ...base, top: '50%', bottom: 3, left: 3, right: 3 }
    case 'center': return { ...base, top: 3, bottom: 3, left: 3, right: 3 }
  }
}

// --- Sub-components ---

function PaneContent({ paneType, tabId, filePath }: { paneType: PaneId; tabId: string; filePath?: string }) {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
        loading...
      </div>
    }>
      {paneType === 'editor' && <EditorPane leafId={tabId} filePath={filePath} />}
      {paneType === 'terminal' && <TerminalPane leafId={tabId} />}
      {paneType === 'graph' && <GraphPane leafId={tabId} />}
      {paneType === 'canvas' && <CanvasPane leafId={tabId} filePath={filePath} />}
      {paneType === 'kanban' && <KanbanPane leafId={tabId} />}
      {paneType === 'ai' && <AiPane leafId={tabId} />}
    </React.Suspense>
  )
}

// --- Tab icon by file extension (reuses same logic as FileTree) ---
function TabIcon({ tab }: { tab: TabEntry }) {
  if (!tab.filePath) return <>{PANE_ICONS[tab.paneType]}</>
  const ext = (tab.label ?? '').split('.').pop()?.toLowerCase() ?? ''
  // Simplified icon mapping for tabs
  const size = TAB_ICON_SIZE
  const s = { flexShrink: 0 } as const
  switch (ext) {
    case 'ts': case 'tsx': return <Code size={size} color="var(--accent)" style={s} />
    case 'js': case 'jsx': case 'mjs': case 'cjs': return <Code size={size} color="var(--amber)" style={s} />
    case 'json': case 'jsonc': return <Code size={size} color="var(--amber)" style={s} />
    case 'css': case 'scss': return <Code size={size} color="var(--sky)" style={s} />
    case 'html': return <Code size={size} color="var(--orange)" style={s} />
    case 'md': case 'mdx': return <Code size={size} color="var(--sky)" style={s} />
    case 'py': return <Code size={size} color="var(--teal)" style={s} />
    case 'rs': return <Code size={size} color="var(--orange)" style={s} />
    case 'go': return <Code size={size} color="var(--cyan)" style={s} />
    case 'yaml': case 'yml': return <Code size={size} color="var(--rose)" style={s} />
    case 'canvas': return <Workflow size={size} color="var(--accent)" style={s} />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': return <Code size={size} color="var(--purple)" style={s} />
    default: return <Code size={size} color="var(--text-secondary)" style={s} />
  }
}

// --- Add pane dropdown ---

function AddPaneDropdown({ onAdd }: { onAdd: (p: PaneId) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} className="leaf-tab-btn" title="Add tab">
        <Plus size={20} />
      </button>
      {open && (
        <div className="leaf-pane-dropdown">
          {ALL_PANES.map(p => (
            <button
              key={p}
              onClick={() => { onAdd(p); setOpen(false) }}
              className="leaf-pane-dropdown-item"
            >
              {PANE_ICONS[p]}
              {PANE_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main LeafView ---

export default function LeafView({ leaf }: { leaf: LeafNode }) {
  const {
    focusedLeafId, setFocusedLeaf, splitLeaf, closeLeaf, addTab, closeTab, setActiveTab, reorderTab,
    layout, draggingLeafId, setDraggingLeaf, moveLeaf, moveTab, togglePin,
  } = useStore()
  const isFocused = focusedLeafId === leaf.id
  const leafCount = countLeaves(layout)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const dragEnterCount = useRef(0)
  const activeTab = getActiveTab(leaf)
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [tabInsertIdx, setTabInsertIdx] = useState<number | null>(null)
  const [tabInsertX, setTabInsertX] = useState<number>(0)

  // --- Drag source (individual tab) ---
  const handleTabDragStart = useCallback((e: React.DragEvent, tab: TabEntry) => {
    setDraggingLeaf(leaf.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/ghosted-tab', JSON.stringify({ leafId: leaf.id, tabId: tab.id }))
    e.dataTransfer.setData('text/plain', leaf.id)
    const ghost = document.createElement('div')
    ghost.textContent = PANE_LABELS[tab.paneType]
    ghost.style.cssText = `
      position: fixed; top: -100px;
      padding: 4px 12px; border-radius: 6px;
      background: #14141f; color: #a99cff; border: 1px solid #28283c;
      font-size: 11px; font-family: -apple-system, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
    `
    document.body.appendChild(ghost)
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2)
    requestAnimationFrame(() => document.body.removeChild(ghost))
  }, [leaf.id, setDraggingLeaf])

  const handleDragEnd = useCallback(() => {
    setDraggingLeaf(null)
    setDropZone(null)
    dropZoneRef.current = null
    dragEnterCount.current = 0
  }, [setDraggingLeaf])

  // --- Drop target (entire leaf) ---
  const isFileDrag = useCallback((e: React.DragEvent) => {
    return (!draggingLeafId && e.dataTransfer.types.includes('Files')) ||
      e.dataTransfer.types.includes('application/ghosted-file')
  }, [draggingLeafId])

  const dropZoneRef = useRef<DropZone | null>(null)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (isFileDrag(e)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const zone = getDropZone(e, rect)
      if (zone !== dropZoneRef.current) { dropZoneRef.current = zone; setDropZone(zone) }
      return
    }
    if (!draggingLeafId) return
    if (draggingLeafId === leaf.id && !e.dataTransfer.types.includes('application/ghosted-tab')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const zone = getDropZone(e, rect)
    if (zone !== dropZoneRef.current) { dropZoneRef.current = zone; setDropZone(zone) }
  }, [draggingLeafId, leaf.id, isFileDrag])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragEnterCount.current++
  }, [])

  const handleDragLeave = useCallback(() => {
    dragEnterCount.current--
    if (dragEnterCount.current <= 0) {
      setDropZone(null)
      dropZoneRef.current = null
      dragEnterCount.current = 0
    }
  }, [])

  const openDroppedFile = useCallback(async (filePath: string, zone: DropZone | null) => {
    const name = filePath.split('/').pop() ?? filePath
    const ext = name.split('.').pop()?.toLowerCase() ?? ''

    let content = ''
    let fileType: 'text' | 'image' | 'video' | 'canvas' = 'text'
    if (ext === 'canvas') {
      content = await window.electron.fs.readfile(filePath).catch(() => '{}')
      fileType = 'canvas'
    } else if (IMAGE_EXTS.includes(ext)) {
      fileType = 'image'
    } else if (VIDEO_EXTS.includes(ext)) {
      fileType = 'video'
    } else {
      content = await window.electron.fs.readfile(filePath)
    }

    if (zone && zone !== 'center') {
      // Edge drop: split first, then open file in the new leaf
      const { splitLeaf: split, setFocusedLeaf: focus } = useStore.getState()
      split(leaf.id, zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical')
      const { focusedLeafId: newLeafId } = useStore.getState()
      focus(newLeafId)
      // Now open file — it will target the newly focused leaf
      useStore.getState().openFile(filePath, name, content, fileType)
    } else {
      // Center drop: open in current leaf
      useStore.getState().openFile(filePath, name, content, fileType)
    }
  }, [leaf.id])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragEnterCount.current = 0

    // File drop from explorer panel
    const ghostedData = e.dataTransfer.getData('application/ghosted-file')
    if (ghostedData) {
      const currentZone = dropZone
      setDropZone(null)
      try {
        const { path } = JSON.parse(ghostedData)
        if (path) openDroppedFile(path, currentZone)
      } catch {}
      return
    }

    // Native file drop from OS
    if (e.dataTransfer.files.length > 0 && !draggingLeafId) {
      const currentZone = dropZone
      setDropZone(null)
      const files = Array.from(e.dataTransfer.files)
      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as any).path as string | undefined
        if (filePath) openDroppedFile(filePath, i === 0 ? currentZone : null)
      }
      return
    }

    // Tab drop (same or different leaf)
    const tabData = e.dataTransfer.getData('application/ghosted-tab')
    if (tabData && dropZone) {
      setDropZone(null)
      try {
        const { leafId: srcLeafId, tabId } = JSON.parse(tabData)
        if (srcLeafId === leaf.id && dropZone !== 'center' && leaf.tabs.length > 1) {
          // Same leaf, edge drop: split this tab out into a new panel
          moveTab(srcLeafId, tabId, leaf.id, dropZone)
        } else if (srcLeafId !== leaf.id) {
          moveTab(srcLeafId, tabId, leaf.id, dropZone)
        }
      } catch {}
      return
    }

    // Leaf drop (whole leaf drag — fallback)
    if (!draggingLeafId || draggingLeafId === leaf.id || !dropZone) {
      setDropZone(null)
      return
    }
    moveLeaf(draggingLeafId, leaf.id, dropZone)
    setDropZone(null)
  }, [draggingLeafId, leaf.id, dropZone, moveLeaf, moveTab, openDroppedFile])

  const isDragTarget = (draggingLeafId != null && draggingLeafId !== leaf.id)
  const isDragSource = draggingLeafId === leaf.id

  return (
    <div
      ref={containerRef}
      className={`leaf-view ${isFocused ? 'leaf-focused' : ''}`}
      onMouseDown={() => setFocusedLeaf(leaf.id)}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        position: 'relative',
        ...(isDragSource ? { opacity: 0.4 } : {}),
      }}
    >
      {/* Tab bar */}
      <div
        className="leaf-tab-bar"
        ref={tabBarRef}
        onDragEnd={() => { handleDragEnd(); setTabInsertIdx(null) }}
        onDragOver={e => {
          if (!e.dataTransfer.types.includes('application/ghosted-tab')) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          // Calculate insertion index from cursor X vs tab midpoints
          const bar = tabBarRef.current
          if (!bar) return
          const tabEls = bar.querySelectorAll<HTMLElement>('.leaf-pane-tab')
          let insertIdx = leaf.tabs.length
          let insertX = 0
          for (let i = 0; i < tabEls.length; i++) {
            const rect = tabEls[i].getBoundingClientRect()
            const mid = rect.left + rect.width / 2
            if (e.clientX < mid) {
              insertIdx = i
              insertX = rect.left - bar.getBoundingClientRect().left
              break
            }
            insertX = rect.right - bar.getBoundingClientRect().left
          }
          setTabInsertIdx(insertIdx)
          setTabInsertX(insertX)
        }}
        onDragLeave={e => {
          // Only clear if leaving the tab bar entirely
          if (!tabBarRef.current?.contains(e.relatedTarget as Node)) {
            setTabInsertIdx(null)
          }
        }}
        onDrop={e => {
          const data = e.dataTransfer.getData('application/ghosted-tab')
          if (!data) return
          e.preventDefault()
          e.stopPropagation()
          const idx = tabInsertIdx ?? leaf.tabs.length
          setTabInsertIdx(null)
          try {
            const { leafId: srcLeafId, tabId } = JSON.parse(data)
            if (srcLeafId === leaf.id) {
              reorderTab(leaf.id, tabId, idx)
            } else {
              moveTab(srcLeafId, tabId, leaf.id, 'center')
              // After move, reorder to the insertion position
              setTimeout(() => reorderTab(leaf.id, tabId, idx), 0)
            }
          } catch {}
        }}
      >
        {/* Pane tabs */}
        {leaf.tabs.map(tab => (
          <div
            key={tab.id}
            className={`leaf-pane-tab ${tab.id === activeTab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(leaf.id, tab.id)}
            draggable
            onDragStart={e => handleTabDragStart(e, tab)}
          >
            <TabIcon tab={tab} />
            <span>{tab.label ?? PANE_LABELS[tab.paneType]}</span>
            <button
              className={`leaf-pane-tab-pin ${tab.pinned ? 'pinned' : ''}`}
              onClick={e => { e.stopPropagation(); togglePin(tab.id) }}
              title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
            >
              <Pin size={16} />
            </button>
            <button
              className="leaf-pane-tab-close"
              onClick={e => { e.stopPropagation(); closeTab(leaf.id, tab.id) }}
            >
              <X size={18} />
            </button>
          </div>
        ))}
        {/* Tab insert indicator */}
        {tabInsertIdx !== null && (
          <div className="tab-insert-indicator" style={{ left: tabInsertX }} />
        )}
        <div style={{ width: 8 }} />
        <AddPaneDropdown onAdd={p => addTab(leaf.id, p)} />
        <span style={{ flex: 1 }} />
        <button onClick={() => splitLeaf(leaf.id, 'horizontal')} title="Split right" className="leaf-tab-btn">
          <PanelRight size={16} />
        </button>
        <button onClick={() => splitLeaf(leaf.id, 'vertical')} title="Split down" className="leaf-tab-btn">
          <PanelBottom size={16} />
        </button>
      </div>

      {/* Pane content — render all tabs, show only active (preserves state) */}
      {leaf.tabs.map(tab => (
        <div
          key={tab.id}
          style={{
            flex: 1, overflow: 'hidden',
            display: tab.id === activeTab.id ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          <PaneContent paneType={tab.paneType} tabId={tab.id} filePath={tab.filePath} />
        </div>
      ))}

      {/* Drop zone overlay */}
      {(isDragTarget || dropZone) && dropZone && (
        <div className="drop-zone-overlay" style={getOverlayStyle(dropZone)} />
      )}
    </div>
  )
}
