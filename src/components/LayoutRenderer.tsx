import React from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { LayoutNode } from '@/store/layout'
import LeafView from './LeafView'

export default function LayoutRenderer({ node }: { node: LayoutNode }) {
  if (node.type === 'leaf') {
    return <LeafView leaf={node} />
  }

  const direction = node.direction === 'horizontal' ? 'horizontal' : 'vertical'

  return (
    <PanelGroup direction={direction} autoSaveId={node.id} style={{ height: '100%' }}>
      <Panel defaultSize={node.sizes[0]} minSize={10}>
        <LayoutRenderer node={node.children[0]} />
      </Panel>
      <PanelResizeHandle className="ghost-resize-handle" />
      <Panel defaultSize={node.sizes[1]} minSize={10}>
        <LayoutRenderer node={node.children[1]} />
      </Panel>
    </PanelGroup>
  )
}
