/**
 * PanePool — portal-based pane lifecycle manager
 *
 * Renders all pane instances (terminals, editors, etc.) at a stable root
 * level and projects them into layout slots via React portals. When panels
 * are moved, resized, or rearranged, only the portal target changes — the
 * pane component never unmounts, so terminal sessions, graph positions,
 * and editor state are fully preserved.
 */

import React, { useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { getAllTabs, PaneId } from '@/store/layout'

// ─── Lazy pane components ──────────────────────────────────────────────────

const EditorPane = React.lazy(() => import('@/panes/EditorPane'))
const TerminalPane = React.lazy(() => import('@/panes/TerminalPane'))
const GraphPane = React.lazy(() => import('@/panes/GraphPane'))
const CanvasPane = React.lazy(() => import('@/panes/CanvasPane'))
const KanbanPane = React.lazy(() => import('@/panes/KanbanPane'))
const AiPane = React.lazy(() => import('@/panes/AiPane'))

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

// ─── Portal target registry ────────────────────────────────────────────────
// LeafView registers target DOM elements here; PanePool reads them to create portals.

let targets = new Map<string, HTMLElement>()
const listeners = new Set<() => void>()

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

function getSnapshot() {
  return targets
}

export function registerPortalTarget(tabId: string, el: HTMLElement | null) {
  if (el === null) {
    if (!targets.has(tabId)) return
    targets = new Map(targets)
    targets.delete(tabId)
    listeners.forEach(l => l())
    return
  }
  if (targets.get(tabId) === el) return // idempotent
  targets = new Map(targets)
  targets.set(tabId, el)
  listeners.forEach(l => l())
}

// ─── PanePool component ───────────────────────────────────────────────────

export default function PanePool() {
  const offscreenRef = useRef<HTMLDivElement>(null)
  const targetMap = useSyncExternalStore(subscribe, getSnapshot)

  // Get all tabs from layout. Custom equality: only re-render when tab identity changes.
  const tabs = useStore(
    s => getAllTabs(s.layout),
    (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id && t.paneType === b[i].paneType && t.filePath === b[i].filePath)
  )

  return (
    <>
      {/* Offscreen fallback for tabs briefly between layout positions */}
      <div
        ref={offscreenRef}
        style={{
          position: 'fixed',
          left: -9999,
          width: 1,
          height: 1,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      />
      {tabs.map(tab => {
        const target = targetMap.get(tab.id) ?? offscreenRef.current
        if (!target) return null
        return createPortal(
          <PaneContent paneType={tab.paneType} tabId={tab.id} filePath={tab.filePath} />,
          target,
          tab.id // stable key — React never unmounts the component
        )
      })}
    </>
  )
}
