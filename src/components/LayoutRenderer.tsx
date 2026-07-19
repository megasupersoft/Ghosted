import { Group, Panel, Separator, useDefaultLayout } from 'react-resizable-panels'
import type { LayoutNode, SplitNode } from '@/store/layout'
import LeafView from './LeafView'

function SplitView({ node }: { node: SplitNode }) {
  const orientation = node.direction === 'horizontal' ? 'horizontal' : 'vertical'
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: node.id,
    panelIds: [`${node.id}-a`, `${node.id}-b`],
  })

  return (
    <Group
      orientation={orientation}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
      style={{ height: '100%' }}
    >
      <Panel id={`${node.id}-a`} defaultSize={`${node.sizes[0]}%`} minSize="10%">
        <LayoutRenderer node={node.children[0]} />
      </Panel>
      <Separator className="ghost-resize-handle" />
      <Panel id={`${node.id}-b`} defaultSize={`${node.sizes[1]}%`} minSize="10%">
        <LayoutRenderer node={node.children[1]} />
      </Panel>
    </Group>
  )
}

export default function LayoutRenderer({ node }: { node: LayoutNode }) {
  if (node.type === 'leaf') {
    return <LeafView leaf={node} />
  }
  return <SplitView node={node} />
}
