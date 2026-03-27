/**
 * PanePool — stable pane lifecycle manager
 *
 * Each tab gets a permanent DOM container that NEVER changes. Pane components
 * are portaled into these permanent containers. LeafView uses native DOM
 * appendChild to move the container into the visible layout slot.
 *
 * This avoids React's createPortal unmount/remount behavior when the portal
 * target changes — because the target NEVER changes.
 */

import React, { useCallback, useEffect } from 'react'
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

// ─── Permanent containers ──────────────────────────────────────────────────
// Each tab gets a permanent div. Portal target never changes = no unmount.

const paneContainers = new Map<string, HTMLDivElement>()

export function getPaneContainer(tabId: string): HTMLDivElement {
  let el = paneContainers.get(tabId)
  if (!el) {
    el = document.createElement('div')
    el.style.cssText = 'display:flex;flex-direction:column;flex:1;overflow:hidden;height:100%;width:100%;'
    el.dataset.paneId = tabId
    paneContainers.set(tabId, el)
  }
  return el
}

export function removePaneContainer(tabId: string) {
  const el = paneContainers.get(tabId)
  if (el) {
    el.remove()
    paneContainers.delete(tabId)
  }
}

// ─── PanePool component ───────────────────────────────────────────────────

export default function PanePool() {
  const tabs = useStore(
    useCallback(s => getAllTabs(s.layout), []),
    (a, b) => a.length === b.length && a.every((t, i) => t.id === b[i].id && t.paneType === b[i].paneType && t.filePath === b[i].filePath)
  )

  // Clean up containers for tabs that no longer exist
  useEffect(() => {
    const activeIds = new Set(tabs.map(t => t.id))
    for (const id of paneContainers.keys()) {
      if (!activeIds.has(id)) removePaneContainer(id)
    }
  }, [tabs])

  return (
    <>
      {tabs.map(tab => {
        const container = getPaneContainer(tab.id)
        return createPortal(
          <PaneContent paneType={tab.paneType} tabId={tab.id} filePath={tab.filePath} />,
          container,
          tab.id
        )
      })}
    </>
  )
}
