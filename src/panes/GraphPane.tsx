import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import ForceGraph2D from 'force-graph'
import { RefreshCw, Ghost } from 'lucide-react'

interface GNode { id: string; label: string }
interface GEdge { id: string; source: string; target: string }

async function buildGraph(dirPath: string): Promise<{ nodes: GNode[]; edges: GEdge[] }> {
  const nodes: GNode[] = []
  const edges: GEdge[] = []
  const seen = new Set<string>()
  const labelToId = new Map<string, string>()
  const pathToId = new Map<string, string>()
  let edgeId = 0

  const scan = async (p: string, depth = 0) => {
    if (depth > 4) return
    try {
      const entries = await window.electron.fs.readdir(p)
      for (const e of entries) {
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') continue
        if (e.isDirectory) { await scan(e.path, depth + 1); continue }
        if (!e.name.match(/\.(md|txt|ts|tsx|js|jsx|py|rs|go)$/)) continue
        if (!seen.has(e.path)) {
          const label = e.name.replace(/\.(md|txt)$/, '')
          nodes.push({ id: e.path, label })
          seen.add(e.path)
          labelToId.set(label.toLowerCase(), e.path)
          // Map relative path variations for import resolution
          const relPath = e.path.replace(dirPath + '/', '')
          pathToId.set(relPath, e.path)
          // Without extension
          pathToId.set(relPath.replace(/\.[^.]+$/, ''), e.path)
        }
      }
    } catch {}
  }
  await scan(dirPath)

  const addEdge = (source: string, target: string) => {
    if (source !== target) edges.push({ id: `e${edgeId++}`, source, target })
  }

  for (const node of nodes) {
    try {
      const content = await window.electron.fs.readfile(node.id)

      // [[wikilinks]] in markdown/txt
      if (node.id.endsWith('.md') || node.id.endsWith('.txt')) {
        const links = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), m => m[1])
        for (const link of links) {
          const targetId = labelToId.get(link.toLowerCase())
          if (targetId) addEdge(node.id, targetId)
        }
      }

      // import/require in code files
      if (node.id.match(/\.(ts|tsx|js|jsx)$/)) {
        // import ... from './path' or import './path'
        const imports = Array.from(content.matchAll(/(?:import|require)\s*\(?[^'"]*['"]([^'"]+)['"]/g), m => m[1])
        for (const imp of imports) {
          if (!imp.startsWith('.')) continue // skip node_modules
          // Resolve relative to the file's directory
          const fileDir = node.id.substring(0, node.id.lastIndexOf('/'))
          const resolved = resolvePath(fileDir, imp).replace(dirPath + '/', '')
          // Try with and without extensions
          const targetId = pathToId.get(resolved)
            ?? pathToId.get(resolved + '/index')
          if (targetId) addEdge(node.id, targetId)
        }
      }

      // import in python
      if (node.id.endsWith('.py')) {
        const imports = Array.from(content.matchAll(/from\s+['".]([^'"]+)['"]\s+import|import\s+(\w+)/g), m => m[1] || m[2])
        for (const imp of imports) {
          const targetId = labelToId.get(imp.toLowerCase()) ?? labelToId.get(imp.toLowerCase() + '.py')
          if (targetId) addEdge(node.id, targetId)
        }
      }
    } catch {}
  }

  return { nodes, edges }
}

function resolvePath(base: string, rel: string): string {
  const parts = base.split('/')
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

export default function GraphPane({ leafId }: { leafId?: string }) {
  const { workspacePath } = useStore()
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const graphElRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<any>(null)

  // Create a dedicated DOM element for force-graph
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

    if (graphRef.current) { graphRef.current._destructor(); graphRef.current = null }
    if (graphElRef.current) graphElRef.current.innerHTML = ''

    if (nodes.length === 0) { setLoading(false); return }

    const { width, height } = graphElRef.current.getBoundingClientRect()

    const graph = ForceGraph2D()(graphElRef.current)
      .graphData({ nodes: nodes as any[], links: edges.map(e => ({ source: e.source, target: e.target })) })
      .width(width)
      .height(height)
      .backgroundColor('#0e0e16')
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
      .linkColor(() => 'rgba(139, 124, 248, 0.3)')
      .linkWidth(1.5)
      .linkDirectionalParticles(1)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(() => '#8b7cf8')
      .warmupTicks(50)
      .cooldownTime(3000)

    graphRef.current = graph
    setLoading(false)
  }, [workspacePath])

  useEffect(() => { refresh() }, [refresh])

  // Debounced resize
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    let timer: ReturnType<typeof setTimeout>
    const ro = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (graphRef.current && graphElRef.current) {
          const { width, height } = graphElRef.current.getBoundingClientRect()
          graphRef.current.width(width).height(height)
        }
      }, 100)
    })
    ro.observe(el)
    return () => { clearTimeout(timer); ro.disconnect() }
  }, [])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}>
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', zIndex: 10, pointerEvents: 'none' }}>scanning workspace...</div>}
        {!workspacePath && <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-ghost)', gap: 8, zIndex: 10, pointerEvents: 'none' }}>
          <Ghost size={32} color="var(--accent)" style={{ opacity: 0.15 }} />
          <span style={{ fontSize: 13 }}>open a workspace to see the graph</span>
        </div>}
        <button onClick={refresh} style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'var(--accent)', padding: '3px 8px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--accent-dim)' }}>
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
    </div>
  )
}
