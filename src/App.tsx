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

export default function App() {
  const { activePane } = useStore()

  const rightPane = () => {
    switch (activePane) {
      case 'terminal': return <TerminalPane />
      case 'graph':    return <GraphPane />
      case 'canvas':   return <CanvasPane />
      case 'kanban':   return <KanbanPane />
      default:         return null
    }
  }

  const isEditor = activePane === 'editor'

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Titlebar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FileTree />
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isEditor ? (
            <PanelGroup direction="vertical" style={{ flex: 1 }}>
              <Panel defaultSize={65} minSize={25}>
                <EditorPane />
              </Panel>
              <PanelResizeHandle style={hDivider} />
              <Panel defaultSize={35} minSize={15}>
                <TerminalPane />
              </Panel>
            </PanelGroup>
          ) : (
            <div style={{ flex: 1, overflow: 'hidden' }}>{rightPane()}</div>
          )}
        </div>
      </div>
    </div>
  )
}
