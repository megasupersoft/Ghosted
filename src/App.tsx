import React from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import Titlebar from '@/components/Titlebar'
import FileTree from '@/panes/FileTree'
import EditorPane from '@/panes/EditorPane'
import TerminalPane from '@/panes/TerminalPane'
import GraphPane from '@/panes/GraphPane'
import CanvasPane from '@/panes/CanvasPane'
import KanbanPane from '@/panes/KanbanPane'
import { useStore } from '@/store'

const hDivider: React.CSSProperties = {
  height: 1, background: 'var(--border)', cursor: 'row-resize', flexShrink: 0,
}

const hidden: React.CSSProperties = {
  position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none', opacity: 0,
}

export default function App() {
  const { activePane } = useStore()

  const isEditor = activePane === 'editor'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Titlebar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FileTree />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* Editor + Terminal split — always mounted */}
          <div style={isEditor ? { flex: 1, display: 'flex', flexDirection: 'column' } : hidden}>
            <PanelGroup direction="vertical" style={{ flex: 1 }} autoSaveId="ghosted-editor-terminal">
              <Panel defaultSize={65} minSize={25}>
                <EditorPane />
              </Panel>
              <PanelResizeHandle style={hDivider} />
              <Panel defaultSize={35} minSize={15}>
                <TerminalPane />
              </Panel>
            </PanelGroup>
          </div>

          {/* Standalone panes — always mounted, shown/hidden */}
          <div style={activePane === 'terminal' ? { flex: 1, overflow: 'hidden' } : hidden}>
            <TerminalPane />
          </div>
          <div style={activePane === 'graph' ? { flex: 1, overflow: 'hidden' } : hidden}>
            <GraphPane />
          </div>
          <div style={activePane === 'canvas' ? { flex: 1, overflow: 'hidden' } : hidden}>
            <CanvasPane />
          </div>
          <div style={activePane === 'kanban' ? { flex: 1, overflow: 'hidden' } : hidden}>
            <KanbanPane />
          </div>
        </div>
      </div>
    </div>
  )
}
