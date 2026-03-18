import React from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import Titlebar from '@/components/Titlebar'
import ActivityBar from '@/components/ActivityBar'
import StatusBar from '@/components/StatusBar'
import FileTree from '@/panes/FileTree'
import SourceControlPane from '@/panes/SourceControlPane'
import SettingsPane from '@/panes/SettingsPane'
import LayoutRenderer from '@/components/LayoutRenderer'
import { useStore } from '@/store'

function SidebarContent({ id }: { id: string }) {
  switch (id) {
    case 'explorer': return <FileTree />
    case 'source-control': return <SourceControlPane />
    case 'settings': return <SettingsPane />
    default: return null
  }
}

export default function App() {
  const { layout, activeSidebar } = useStore()

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Titlebar />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ActivityBar />
        {activeSidebar ? (
          <PanelGroup direction="horizontal" autoSaveId="ghosted-sidebar">
            <Panel defaultSize={18} minSize={10} maxSize={40} style={{ overflow: 'hidden' }}>
              <SidebarContent id={activeSidebar} />
            </Panel>
            <PanelResizeHandle className="ghost-resize-handle" />
            <Panel minSize={30}>
              <LayoutRenderer node={layout} />
            </Panel>
          </PanelGroup>
        ) : (
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <LayoutRenderer node={layout} />
          </div>
        )}
      </div>
      <StatusBar />
    </div>
  )
}
