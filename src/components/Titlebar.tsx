import React from 'react'
import { useStore, PaneId } from '@/store'
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

const PANE_LABELS: Record<PaneId, string> = {
  editor: 'Editor',
  terminal: 'Terminal',
  graph: 'Graph',
  canvas: 'Canvas',
  kanban: 'Kanban',
}

function SortableTab({ id }: { id: PaneId }) {
  const { activePane, setActivePane } = useStore()
  const active = activePane === id
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id })

  const style: React.CSSProperties = {
    height: 28, padding: '0 13px', borderRadius: 'var(--radius-sm)', fontSize: 11,
    background: active ? 'var(--bg-selection)' : 'transparent',
    color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
    border: active ? '1px solid var(--border-mid)' : '1px solid transparent',
    display: 'flex', alignItems: 'center', gap: 5,
    boxShadow: active ? '0 0 8px var(--accent-glow)' : 'none',
    transition: transition ?? 'all 0.15s',
    transform: CSS.Transform.toString(transform),
    cursor: isDragging ? 'grabbing' : 'pointer',
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : 'auto',
    position: 'relative',
    touchAction: 'none',
  }

  return (
    <button
      ref={setNodeRef}
      onClick={() => setActivePane(id)}
      style={style}
      {...attributes}
      {...listeners}
    >
      {active && <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, boxShadow: '0 0 6px var(--accent)' }} className="ghost-pulse" />}
      {PANE_LABELS[id]}
    </button>
  )
}

export default function Titlebar() {
  const { workspacePath, paneOrder, setPaneOrder } = useStore()
  const wsName = workspacePath?.split('/').pop() ?? null

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = paneOrder.indexOf(active.id as PaneId)
    const newIndex = paneOrder.indexOf(over.id as PaneId)
    if (oldIndex === -1 || newIndex === -1) return
    setPaneOrder(arrayMove(paneOrder, oldIndex, newIndex))
  }

  return (
    <div style={{
      height: 'var(--titlebar-h)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center',
      WebkitAppRegion: 'drag' as any,
      userSelect: 'none', flexShrink: 0,
    }}>
      <div style={{ width: 80, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 20, WebkitAppRegion: 'no-drag' as any }}>
        <span style={{ fontSize: 14, opacity: 0.2 }}>👻</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 500, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
          ghosted
        </span>
        {wsName && (
          <>
            <span style={{ color: 'var(--text-ghost)', fontSize: 11 }}>/</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{wsName}</span>
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 1, WebkitAppRegion: 'no-drag' as any }}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={paneOrder} strategy={horizontalListSortingStrategy}>
            {paneOrder.map(id => <SortableTab key={id} id={id} />)}
          </SortableContext>
        </DndContext>
      </div>
      <div style={{ marginLeft: 'auto', marginRight: 16, WebkitAppRegion: 'no-drag' as any }}>
        <span style={{ fontSize: 10, color: 'var(--text-ghost)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>v0.1.0</span>
      </div>
    </div>
  )
}
