import React, { useEffect, useState, useCallback } from 'react'
import { useStore } from '@/store'

interface GNode { id: string; label: string }
interface GEdge { id: string; source: string; target: string }

async function buildGraph(dirPath: string): Promise<{ nodes: GNode[]; edges: GEdge[] }> {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const seen = new Set<string>()
  let edgeId = 0

  const scan = async (p: string, depth = 0) => {
    if (depth > 4) return
    try {
      const entries = await window.electron.fs.readdir(p)
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules') continue
        if (e.isDirectory) { await scan(e.path, depth + 1); continue }
        if (!e.name.match(/\.(md|txt|ts|tsx|js|jsx|py)$/)) continue
        if (!seen.has(e.path)) { nodes.push({ id: e.path, label: e.name.replace(/\.(md|txt)$/, '') }); seen.add(e.path) }
        if (e.name.endsWith('.md') || e.name.endsWith('.txt')) {
          try {
            const content = await window.electron.fs.readfile(e.path)
            const links = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1])
            for (const link of links) edges.push({ id: `e${edgeId++}`, source: e.path, target: link })
          } catch {}
        }
      }
    } catch {}
  }
  await scan(dirPath)
  return { nodes, edges }
}

export default function GraphPane() {
  const { workspacePath } = useStore()
  const [nodes, setNodes] = useState<GNode[]>([])
  const [edges, setEdges] = useState<GEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [GraphCanvas, setGraphCanvas] = useState<React.ComponentType<any> | null>(null)

  useEffect(() => { import('reagraph').then(m => setGraphCanvas(() => m.GraphCanvas)).catch(() => {}) }, [])

  const refresh = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    const { nodes: n, edges: e } = await buildGraph(workspacePath)
    setNodes(n); setEdges(e); setLoading(false)
  }, [workspacePath])

  useEffect(() => { refresh() }, [refresh])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-base)' }}>
      <div style={{ padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Knowledge graph</span>
        <span style={{ flex: 1 }} />
        <button onClick={refresh} style={{ fontSize: 11, color: 'var(--accent)', padding: '2px 8px', borderRadius: 3, border: '1px solid var(--accent-dim)' }}>Refresh</button>
      </div>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--font-mono)', zIndex: 10 }}>scanning workspace…</div>}
        {!workspacePath && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 8 }}>
          <span style={{ fontSize: 32, opacity: 0.15 }}>👻</span>
          <span style={{ fontSize: 11 }}>open a workspace to see the graph</span>
        </div>}
        {GraphCanvas && nodes.length > 0 && (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            layoutType="forceDirected2d"
            theme={{
              canvas: { background: '#09090e' },
              node: { fill: '#14101f', activeFill: '#8b7cf8', stroke: '#3a2a6a', activeStroke: '#a99cff', label: { color: '#404060', activeColor: '#e2e2f0', fontSize: 4 } },
              edge: { fill: '#1e1e2e', activeFill: '#8b7cf8' },
            }}
            style={{ width: '100%', height: '100%' }}
          />
        )}
      </div>
      <div style={{ padding: '5px 12px', borderTop: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10, fontFamily: 'var(--font-mono)', display: 'flex', gap: 12 }}>
        <span>{nodes.length} nodes</span><span>{edges.length} edges</span>
      </div>
    </div>
  )
}
