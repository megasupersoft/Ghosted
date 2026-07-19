import ForceGraph2D from 'force-graph'
import { Ghost, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { filterGraph, type GraphDepth, matchNodes } from '@/lib/graphFilter'
import { useStore } from '@/store'

interface GNode {
  id: string
  label: string
}
interface GEdge {
  id: string
  source: string
  target: string
}

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
        if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build')
          continue
        if (e.isDirectory) {
          await scan(e.path, depth + 1)
          continue
        }
        if (!e.name.match(/\.(md|txt|ts|tsx|js|jsx|py|rs|go)$/)) continue
        if (!seen.has(e.path)) {
          const label = e.name.replace(/\.(md|txt)$/, '')
          nodes.push({ id: e.path, label })
          seen.add(e.path)
          labelToId.set(label.toLowerCase(), e.path)
          // Map relative path variations for import resolution
          const relPath = e.path.replace(`${dirPath}/`, '')
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
        const links = Array.from(content.matchAll(/\[\[([^\]]+)\]\]/g), (m) => m[1])
        for (const link of links) {
          const targetId = labelToId.get(link.toLowerCase())
          if (targetId) addEdge(node.id, targetId)
        }
      }

      // import/require in code files
      if (node.id.match(/\.(ts|tsx|js|jsx)$/)) {
        // import ... from './path' or import './path'
        const imports = Array.from(
          content.matchAll(/(?:import|require)\s*\(?[^'"]*['"]([^'"]+)['"]/g),
          (m) => m[1],
        )
        for (const imp of imports) {
          if (!imp.startsWith('.')) continue // skip node_modules
          // Resolve relative to the file's directory
          const fileDir = node.id.substring(0, node.id.lastIndexOf('/'))
          const resolved = resolvePath(fileDir, imp).replace(`${dirPath}/`, '')
          // Try with and without extensions
          const targetId = pathToId.get(resolved) ?? pathToId.get(`${resolved}/index`)
          if (targetId) addEdge(node.id, targetId)
        }
      }

      // import in python
      if (node.id.endsWith('.py')) {
        const imports = Array.from(
          content.matchAll(/from\s+['".]([^'"]+)['"]\s+import|import\s+(\w+)/g),
          (m) => m[1] || m[2],
        )
        for (const imp of imports) {
          const targetId = labelToId.get(imp.toLowerCase()) ?? labelToId.get(`${imp.toLowerCase()}.py`)
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

export default function GraphPane(_props: { leafId?: string }) {
  const { workspacePath } = useStore()
  const [loading, setLoading] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const graphElRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<any>(null)

  // Search + depth-limited local view
  const [query, setQuery] = useState('')
  const [depth, setDepth] = useState<GraphDepth>('all')
  const [root, setRoot] = useState<{ id: string; label: string } | null>(null)
  const [visibleCount, setVisibleCount] = useState<{ shown: number; total: number }>({
    shown: 0,
    total: 0,
  })
  // Full graph kept as canonical data: node objects are reused across filter
  // passes so force-graph preserves their simulated positions.
  const fullRef = useRef<{ nodes: any[]; links: GEdge[] }>({ nodes: [], links: [] })
  const matchesRef = useRef<Set<string>>(new Set())
  const rootRef = useRef<string | null>(null)
  // Read by stable callbacks so depth changes never recreate refresh()
  const depthRef = useRef<GraphDepth>('all')

  const applyView = useCallback((rootId: string | null, d: GraphDepth) => {
    const graph = graphRef.current
    if (!graph) return
    const { nodes, links } = fullRef.current
    const filtered = filterGraph(nodes, links, rootId, d)
    graph.graphData({
      nodes: filtered.nodes,
      // Fresh link objects each pass — force-graph mutates source/target into
      // node references, so the canonical string-based list must stay clean.
      links: filtered.links.map((l) => ({ source: l.source, target: l.target })),
    })
    setVisibleCount({ shown: filtered.nodes.length, total: nodes.length })
  }, [])

  const focusNode = useCallback(
    (node: { id: string; label: string }) => {
      rootRef.current = node.id
      setRoot(node)
      applyView(node.id, depthRef.current)
      const live = fullRef.current.nodes.find((n) => n.id === node.id)
      if (live && typeof live.x === 'number') {
        graphRef.current?.centerAt(live.x, live.y, 500)
        graphRef.current?.zoom(3, 500)
      }
    },
    [applyView],
  )

  const clearRoot = useCallback(() => {
    rootRef.current = null
    setRoot(null)
    applyView(null, depthRef.current)
  }, [applyView])

  // Create a dedicated DOM element for force-graph
  useEffect(() => {
    if (!wrapperRef.current) return
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;inset:0;'
    wrapperRef.current.appendChild(el)
    graphElRef.current = el
    return () => {
      if (graphRef.current) {
        graphRef.current._destructor()
        graphRef.current = null
      }
      el.remove()
      graphElRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!workspacePath || !graphElRef.current) return
    setLoading(true)
    const { nodes, edges } = await buildGraph(workspacePath)

    if (graphRef.current) {
      graphRef.current._destructor()
      graphRef.current = null
    }
    if (graphElRef.current) graphElRef.current.innerHTML = ''

    fullRef.current = { nodes: nodes as any[], links: edges }
    rootRef.current = null
    setRoot(null)
    setVisibleCount({ shown: nodes.length, total: nodes.length })

    if (nodes.length === 0) {
      setLoading(false)
      return
    }

    const { width, height } = graphElRef.current.getBoundingClientRect()

    const graph = ForceGraph2D()(graphElRef.current)
      .graphData({ nodes: nodes as any[], links: edges.map((e) => ({ source: e.source, target: e.target })) })
      .width(width)
      .height(height)
      .backgroundColor('#252532')
      .autoPauseRedraw(false)
      .nodeColor((n: any) => {
        if (rootRef.current === n.id) return '#fbbf24'
        if (matchesRef.current.has(n.id)) return '#c8c2f5'
        return matchesRef.current.size > 0 ? 'rgba(139,124,248,0.25)' : '#8b7cf8'
      })
      .nodeRelSize(4)
      .nodeLabel((n: any) => n.label)
      .nodeCanvasObjectMode(() => 'after')
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const label = node.label
        const highlighted = matchesRef.current.has(node.id) || rootRef.current === node.id
        const fontSize = Math.max(10 / globalScale, 2)
        ctx.font = `${fontSize}px monospace`
        ctx.fillStyle = highlighted
          ? 'rgba(240,240,245,0.95)'
          : matchesRef.current.size > 0
            ? 'rgba(172,186,199,0.25)'
            : 'rgba(172,186,199,0.7)'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(label, node.x, node.y + 5)
      })
      .linkColor(() => 'rgba(139, 124, 248, 0.3)')
      .linkWidth(1.5)
      .linkDirectionalParticles(1)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(() => '#8b7cf8')
      .onNodeClick((n: any) => focusNode({ id: n.id, label: n.label }))
      .onBackgroundClick(() => clearRoot())
      .warmupTicks(50)
      .cooldownTime(3000)

    graphRef.current = graph
    setLoading(false)
  }, [workspacePath, focusNode, clearRoot])

  // Search highlights live; depth changes re-filter around the current root
  useEffect(() => {
    matchesRef.current = matchNodes(fullRef.current.nodes, query)
  }, [query])

  useEffect(() => {
    depthRef.current = depth
    applyView(rootRef.current, depth)
  }, [depth, applyView])

  const onSearchEnter = useCallback(() => {
    const matches = matchNodes(fullRef.current.nodes, query)
    const first = fullRef.current.nodes.find((n) => matches.has(n.id))
    if (first) focusNode({ id: first.id, label: first.label })
  }, [query, focusNode])

  useEffect(() => {
    refresh()
  }, [refresh])

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
    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [])

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)' }}
    >
      <div ref={wrapperRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            scanning workspace...
          </div>
        )}
        {!workspacePath && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-ghost)',
              gap: 8,
              zIndex: 10,
              pointerEvents: 'none',
            }}
          >
            <Ghost size={32} color="var(--accent)" style={{ opacity: 0.15 }} />
            <span style={{ fontSize: 13 }}>open a workspace to see the graph</span>
          </div>
        )}
        {/* Search + depth controls */}
        <div className="graph-controls">
          <input
            className="graph-search"
            placeholder="search nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearchEnter()
              if (e.key === 'Escape') {
                setQuery('')
                clearRoot()
              }
            }}
          />
          <select
            className="graph-depth"
            value={String(depth)}
            onChange={(e) =>
              setDepth(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2 | 3))
            }
            title="Show nodes within N links of the focused node"
          >
            <option value="all">depth: all</option>
            <option value="1">depth: 1</option>
            <option value="2">depth: 2</option>
            <option value="3">depth: 3</option>
          </select>
          {root && (
            <button type="button" className="graph-root-chip" onClick={clearRoot} title="Clear focus">
              {root.label} <X size={11} />
            </button>
          )}
          <span className="graph-count" data-node-count={visibleCount.shown}>
            {visibleCount.shown === visibleCount.total
              ? `${visibleCount.total} nodes`
              : `${visibleCount.shown} / ${visibleCount.total} nodes`}
          </span>
        </div>

        <button
          type="button"
          onClick={refresh}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: 'var(--accent)',
            padding: '3px 8px',
            borderRadius: 4,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--accent-dim)',
          }}
        >
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
    </div>
  )
}
