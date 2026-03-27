import React, { useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import Titlebar from '@/components/Titlebar'
import ActivityBar from '@/components/ActivityBar'
import StatusBar from '@/components/StatusBar'
import FileTree from '@/panes/FileTree'
import SourceControlPane from '@/panes/SourceControlPane'
import SettingsPane from '@/panes/SettingsPane'
import LayoutRenderer from '@/components/LayoutRenderer'
import PanePool from '@/components/PanePool'
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
  const { layout, activeSidebar, workspacePath } = useStore()

  // Listen for Pi agent actions (open file, switch pane, etc.)
  useEffect(() => {
    window.electron.pi.onAction((action: any) => {
      const store = useStore.getState()
      switch (action.type) {
        case 'openFile':
          store.openFile(action.filePath, action.name, action.content, 'text')
          break
        case 'switchPane':
          store.addTab(store.focusedLeafId, action.pane)
          break
      }
    })
    return () => window.electron.pi.offAction()
  }, [])

  // Live file updates: watch workspace directory for external changes
  useEffect(() => {
    if (!workspacePath) return

    window.electron.fs.watch(workspacePath)

    const handleChange = async (event: { dir: string; eventType: string; filename: string }) => {
      if (!event.filename) return
      const { openFiles, updateFileContent } = useStore.getState()
      // Build the full path — the event dir is the watched directory
      const fullPath = event.dir + '/' + event.filename
      const file = openFiles.find(f => f.path === fullPath)
      if (!file) return
      // Don't overwrite unsaved user changes
      if (file.isDirty) return
      try {
        const newContent = await window.electron.fs.readfile(fullPath)
        // Re-check isDirty after async read in case user edited during the read
        const current = useStore.getState().openFiles.find(f => f.path === fullPath)
        if (current && !current.isDirty && current.content !== newContent) {
          updateFileContent(fullPath, newContent)
        }
      } catch {
        // File may have been deleted or become unreadable — ignore
      }
    }

    const handler = window.electron.fs.onChanged(handleChange)

    return () => {
      window.electron.fs.offChanged(handler)
    }
  }, [workspacePath])

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
      <PanePool />
    </div>
  )
}
