import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import ForceGraph2D from 'force-graph'

interface GNode { id: string; label: string }
interface GEdge { id: string; source: string; target: string }

async function buildGraph(dirPath: string): Promise<{ nodes: GNode[]; edges: GEdge[] }> {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const seen = new Set<string>()
  const labelToId = new Map<string, string>()
  let edgeId = 0

  const scan = async (p: string, depth = 0) => {
    if (depth > 4) return
    try {
      const entries = await window.electron.fs.readdir(p)
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        if (e.isDirectory) { await scan(e.path, depth + 1); continue }
        if (!e.name.match(/\.(md|txt|ts|tsx|js|jsx|py)$/)) continue
        if (!seen.has(e.path)) {
          const label = e.name.replace(/\.(md|txt)$/, '')
          nodes.push({ id: e.path, label })
          seen.add(e.path)
          labelToId.set(label.toLowerCase(), e.path)
        }
      }
    } catch {}
  }
  await scan(dirPath)

  for (const node of nodes) {
    if (!node.id.endsWith('.md') && !node.id.endsWith('.txt')) continue
    try {
      const content = await window.electron.fs.readfile(node.id)
      const links = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1])
      for (const link of links) {
        const targetId = labelToId.get(link.toLowerCase())
        if (targetId) edges.push({ id: `e${edgeId++}`, source: node.id, target: targetId })
      }
    } catch {}
  }

  return { nodes, edges }
}

export default function GraphPane() {
  const { workspacePath } = useStore()
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const graphElRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<ReturnType<typeof ForceGraph2D> | null>(null)

  // Create a dedicated DOM element for force-graph (outside React's control)
  useEffect(() => {
    if (!wrapperRef.current) return
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;inset:0;'
    wrapperRef.current.appendChild(el)
    graphElRef.current = el
    return () => {
      if (graphRef.current) { graphRef.current._destructor(); graphRef.current = null }
      el.remove()
      graphElRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!workspacePath || !graphElRef.current) return
    setLoading(true)
    const { nodes, edges } = await buildGraph(workspacePath)
    setNodeCount(nodes.length)
    setEdgeCount(edges.length)

    if (graphRef.current) { graphRef.current._destructor(); graphRef.current = null }
    // Clear any leftover DOM from previous graph instance
    if (graphElRef.current) graphElRef.current.innerHTML = ''

    if (nodes.length === 0) { setLoading(false); return }

    const { width, height } = graphElRef.current.getBoundingClientRect()

    const graph = ForceGraph2D()(graphElRef.current)
      .graphData({ nodes: nodes as any[], links: edges.map(e => ({ source: e.source, target: e.target })) })
      .width(width)
      .height(height)
      .backgroundColor('#09090e')
      .nodeColor(() => '#8b7cf8')
      .nodeRelSize(4)
      .nodeLabel((n: any) => n.label)
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.label
        const fontSize = Math.max(10 / globalScale, 2)
        ctx.font = `${fontSize}px monospace`
        ctx.fillStyle = 'rgba(172,186,199,0.7)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, node.x, node.y + 5)
      })
      .linkColor(() => '#1e1e2e')
      .linkWidth(1)
      .warmupTicks(50)
      .cooldownTime(3000)

    graphRef.current = graph
    setLoading(false)
  }, [workspacePath])

  useEffect(() => { refresh() }, [refresh])

  // Handle resize
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (graphRef.current && graphElRef.current) {
        const { width, height } = graphElRef.current.getBoundingClientRect()
        graphRef.current.width(width).height(height)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Knowledge graph</span>
        <span style={{ flex: 1 }} />
        <button onClick={refresh} style={{ fontSize: 11, color: 'var(--accent)', padding: '2px 8px', borderRadius: 3, border: '1px solid var(--accent-dim)' }}>Refresh</button>
      </div>
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {/* Overlays rendered above the force-graph canvas */}
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', zIndex: 10, pointerEvents: 'none' }}>scanning workspace...</div>}
        {!workspacePath && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 8, zIndex: 10, pointerEvents: 'none' }}>
          <span style={{ fontSize: 32, opacity: 0.15 }}>👻</span>
          <span style={{ fontSize: 11 }}>open a workspace to see the graph</span>
        </div>}
      </div>
      <div style={{ padding: '5px 12px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)', display: 'flex', gap: 12 }}>
        <span>{nodeCount} nodes</span><span>{edgeCount} edges</span>
      </div>
    </div>
  )
}
