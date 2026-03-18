import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useStore } from '@/store'
import { LeafNode, PaneId, DropZone, countLeaves } from '@/store/layout'
import {
  Code, Terminal, Share2, Workflow, Kanban,
  PanelRight, PanelBottom, X, ChevronDown,
} from 'lucide-react'

const ICON_SIZE = 14

const PANE_ICONS: Record<PaneId, React.ReactNode> = {
  editor:   <Code size={ICON_SIZE} />,
  terminal: <Terminal size={ICON_SIZE} />,
  graph:    <Share2 size={ICON_SIZE} />,
  canvas:   <Workflow size={ICON_SIZE} />,
  kanban:   <Kanban size={ICON_SIZE} />,
}

const PANE_LABELS: Record<PaneId, string> = {
  editor: 'Editor',
  terminal: 'Terminal',
  graph: 'Graph',
  canvas: 'Canvas',
  kanban: 'Kanban',
}

const ALL_PANES: PaneId[] = ['editor', 'terminal', 'graph', 'canvas', 'kanban']

// Lazy-load pane components
const EditorPane = React.lazy(() => import('@/panes/EditorPane'))
const TerminalPane = React.lazy(() => import('@/panes/TerminalPane'))
const GraphPane = React.lazy(() => import('@/panes/GraphPane'))
const CanvasPane = React.lazy(() => import('@/panes/CanvasPane'))
const KanbanPane = React.lazy(() => import('@/panes/KanbanPane'))

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
    transition: 'all 100ms ease-in-out',
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

function PaneContent({ paneType, leafId }: { paneType: PaneId; leafId: string }) {
  return (
    <React.Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-ghost)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
        loading...
      </div>
    }>
      {paneType === 'editor' && <EditorPane leafId={leafId} />}
      {paneType === 'terminal' && <TerminalPane leafId={leafId} />}
      {paneType === 'graph' && <GraphPane leafId={leafId} />}
      {paneType === 'canvas' && <CanvasPane leafId={leafId} />}
      {paneType === 'kanban' && <KanbanPane leafId={leafId} />}
    </React.Suspense>
  )
}

function PaneDropdown({ current, onChange }: { current: PaneId; onChange: (p: PaneId) => void }) {
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
      <button
        onClick={() => setOpen(o => !o)}
        className="leaf-pane-selector"
      >
        {PANE_ICONS[current]}
        {PANE_LABELS[current]}
        <ChevronDown size={10} style={{ opacity: 0.5 }} />
      </button>
      {open && (
        <div className="leaf-pane-dropdown">
          {ALL_PANES.map(p => (
            <button
              key={p}
              onClick={() => { onChange(p); setOpen(false) }}
              className={`leaf-pane-dropdown-item ${p === current ? 'active' : ''}`}
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
    focusedLeafId, setFocusedLeaf, splitLeaf, closeLeaf, changeLeafPane,
    layout, draggingLeafId, setDraggingLeaf, moveLeaf,
  } = useStore()
  const isFocused = focusedLeafId === leaf.id
  const leafCount = countLeaves(layout)
  const containerRef = useRef<HTMLDivElement>(null)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const dragEnterCount = useRef(0)

  // --- Drag source (tab bar) ---
  const handleDragStart = useCallback((e: React.DragEvent) => {
    setDraggingLeaf(leaf.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', leaf.id)
    const ghost = document.createElement('div')
    ghost.textContent = PANE_LABELS[leaf.paneType]
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
  }, [leaf.id, leaf.paneType, setDraggingLeaf])

  const handleDragEnd = useCallback(() => {
    setDraggingLeaf(null)
    setDropZone(null)
    dragEnterCount.current = 0
  }, [setDraggingLeaf])

  // --- Drop target (entire leaf) ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!draggingLeafId || draggingLeafId === leaf.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setDropZone(getDropZone(e, rect))
  }, [draggingLeafId, leaf.id])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragEnterCount.current++
  }, [])

  const handleDragLeave = useCallback(() => {
    dragEnterCount.current--
    if (dragEnterCount.current <= 0) {
      setDropZone(null)
      dragEnterCount.current = 0
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragEnterCount.current = 0
    if (!draggingLeafId || draggingLeafId === leaf.id || !dropZone) {
      setDropZone(null)
      return
    }
    moveLeaf(draggingLeafId, leaf.id, dropZone)
    setDropZone(null)
  }, [draggingLeafId, leaf.id, dropZone, moveLeaf])

  const isDragTarget = draggingLeafId != null && draggingLeafId !== leaf.id
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
        opacity: isDragSource ? 0.4 : 1,
        transition: 'opacity 150ms',
      }}
    >
      {/* Tab bar — drag handle */}
      <div
        className="leaf-tab-bar"
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <PaneDropdown current={leaf.paneType} onChange={p => changeLeafPane(leaf.id, p)} />
        <span style={{ flex: 1 }} />
        <button onClick={() => splitLeaf(leaf.id, 'horizontal')} title="Split right" className="leaf-tab-btn">
          <PanelRight size={13} />
        </button>
        <button onClick={() => splitLeaf(leaf.id, 'vertical')} title="Split down" className="leaf-tab-btn">
          <PanelBottom size={13} />
        </button>
        {leafCount > 1 && (
          <button onClick={() => closeLeaf(leaf.id)} title="Close pane" className="leaf-tab-btn">
            <X size={13} />
          </button>
        )}
      </div>

      {/* Pane content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PaneContent paneType={leaf.paneType} leafId={leaf.id} />
      </div>

      {/* Drop zone overlay */}
      {isDragTarget && dropZone && (
        <div className="drop-zone-overlay" style={getOverlayStyle(dropZone)} />
      )}
    </div>
  )
}
