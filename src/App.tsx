import { useEffect } from 'react'
import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import ActivityBar from '@/components/ActivityBar'
import CommandPalette from '@/components/CommandPalette'
import LayoutRenderer from '@/components/LayoutRenderer'
import PanePool from '@/components/PanePool'
import StatusBar from '@/components/StatusBar'
import Titlebar from '@/components/Titlebar'
import { useGhostDB } from '@/lib/useGhostDB'
import FileTree from '@/panes/FileTree'
import SettingsPane from '@/panes/SettingsPane'
import SourceControlPane from '@/panes/SourceControlPane'
import { useStore } from '@/store'

function SidebarContent({ id }: { id: string }) {
  switch (id) {
    case 'explorer':
      return <FileTree />
    case 'source-control':
      return <SourceControlPane />
    case 'settings':
      return <SettingsPane />
    default:
      return null
  }
}

export default function App() {
  const { layout, activeSidebar, workspacePath } = useStore()
  // Index the workspace at app level so the palette's quick-open and the
  // graph/canvas panes all see a warm GhostedDB regardless of pane order.
  useGhostDB()
  const sidebarLayout = useDefaultLayout({
    id: 'ghosted-sidebar',
    panelIds: ['ghosted-sidebar-nav', 'ghosted-sidebar-main'],
  })

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
      const fullPath = `${event.dir}/${event.filename}`
      const file = openFiles.find((f) => f.path === fullPath)
      if (!file) return
      // Don't overwrite unsaved user changes
      if (file.isDirty) return
      try {
        const newContent = await window.electron.fs.readfile(fullPath)
        // Re-check isDirty after async read in case user edited during the read
        const current = useStore.getState().openFiles.find((f) => f.path === fullPath)
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
      <CommandPalette />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <ActivityBar />
        {activeSidebar ? (
          <Group
            orientation="horizontal"
            defaultLayout={sidebarLayout.defaultLayout}
            onLayoutChanged={sidebarLayout.onLayoutChanged}
          >
            <Panel
              id="ghosted-sidebar-nav"
              defaultSize="18%"
              minSize="10%"
              maxSize="40%"
              style={{ overflow: 'hidden' }}
            >
              <SidebarContent id={activeSidebar} />
            </Panel>
            <Separator className="ghost-resize-handle" />
            <Panel id="ghosted-sidebar-main" minSize="30%">
              <LayoutRenderer node={layout} />
            </Panel>
          </Group>
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
