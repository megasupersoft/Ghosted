import ForceGraph2D from 'force-graph'
import { Ghost, RefreshCw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { type AgentGraphData, type AgentGraphNode, deriveAgentGraph } from '@/lib/agentGraph'
import { filterGraph, type GraphDepth, matchNodes } from '@/lib/graphFilter'
import { useStore } from '@/store'
import { useAgentsStore } from '@/store/agents'

type GraphSource = 'files' | 'agents'

// ---------- Agents-mode canvas painting (ported from ghosted2/src/components/AgentGraph.tsx) ----------

interface AgentSimNode extends AgentGraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

interface AgentSimLink {
  source: string | AgentSimNode
  target: string | AgentSimNode
}

const AGENT_STATUS_COLOR: Record<AgentGraphNode['status'], string> = {
  active: '#7ee8c7',
  blocked: '#fbbf24',
  error: '#f87171',
  done: '#55636f',
  idle: '#3a4653',
}
const AGENT_LINK_COLOR = 'rgba(139, 124, 248, 0.25)'
const AGENT_LABEL_COLOR = 'rgba(172, 186, 199, 0.8)'
const AGENT_ACCENT_COLOR = '#c8c2f5'
const AGENT_DIM_ALPHA = 0.35

const AGENT_NODE_RADIUS = 9
const TOOL_NODE_RADIUS = 5
const FILE_NODE_HALF_SIZE = 4

function agentNodeRadius(kind: AgentGraphNode['kind']): number {
  if (kind === 'agent') return AGENT_NODE_RADIUS
  if (kind === 'tool') return TOOL_NODE_RADIUS
  return FILE_NODE_HALF_SIZE
}

function resolveAgentNode(ref: string | AgentSimNode | undefined): AgentSimNode | undefined {
  return typeof ref === 'object' ? ref : undefined
}

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

  // ---------- Agents source (additive) ----------
  // Default source is 'files' — everything above this point is the
  // pre-existing knowledge-graph pane, untouched.
  const [source, setSource] = useState<GraphSource>('files')
  const agentGraphElRef = useRef<HTMLDivElement | null>(null)
  const agentGraphRef = useRef<any>(null)
  const agentNodeMapRef = useRef(new Map<string, AgentSimNode>())
  const agentMatchesRef = useRef<Set<string>>(new Set())
  const agentHoveredIdRef = useRef<string | null>(null)
  const agentsInitedRef = useRef(false)
  const selectedSessionIdRef = useRef<string | null>(null)
  const selectSessionRef = useRef<(id: string | null) => void>(() => {})
  const agentQueryRef = useRef('')
  // Throttle: re-derives coalesce to at most one push per 100ms (<=10fps)
  // so a chatty ACP update stream doesn't hammer the force simulation.
  const agentDeriveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const agentLastDeriveAtRef = useRef(0)
  const agentInputsRef = useRef<{
    sessions: Parameters<typeof deriveAgentGraph>[0]
    updates: Parameters<typeof deriveAgentGraph>[1]
    pendingPermissions: Parameters<typeof deriveAgentGraph>[2]
  }>({ sessions: [], updates: [], pendingPermissions: [] })

  const available = useAgentsStore((s) => s.available)
  const agentSessions = useAgentsStore((s) => s.sessions)
  const agentUpdates = useAgentsStore((s) => s.updates)
  const agentPendingPermissions = useAgentsStore((s) => s.pendingPermissions)
  const agentSelectedSessionId = useAgentsStore((s) => s.selectedSessionId)
  const initAgentsStore = useAgentsStore((s) => s.init)
  const selectAgentSession = useAgentsStore((s) => s.select)

  useEffect(() => {
    selectedSessionIdRef.current = agentSelectedSessionId
  }, [agentSelectedSessionId])

  useEffect(() => {
    selectSessionRef.current = selectAgentSession
  }, [selectAgentSession])

  useEffect(() => {
    agentQueryRef.current = query
    agentMatchesRef.current = matchNodes(
      Array.from(agentNodeMapRef.current.values()).map((n) => ({ id: n.id, label: n.label })),
      query,
    )
  }, [query])

  const [agentNodeCount, setAgentNodeCount] = useState(0)

  const selectSource = useCallback(
    (next: GraphSource) => {
      setSource(next)
      if (next === 'agents' && !agentsInitedRef.current) {
        agentsInitedRef.current = true
        initAgentsStore()
      }
    },
    [initAgentsStore],
  )

  // Push a derived AgentGraphData snapshot into the agent force-graph
  // instance, reusing existing node objects by id so the simulation keeps
  // their positions stable across live updates (same pattern as ghosted2's
  // AgentGraph.tsx and this pane's own file-mode node-object reuse).
  const pushAgentGraphData = useCallback((data: AgentGraphData) => {
    const graph = agentGraphRef.current
    if (!graph) return

    const nodeMap = agentNodeMapRef.current
    const seen = new Set<string>()
    const nodes: AgentSimNode[] = []
    for (const n of data.nodes) {
      let obj = nodeMap.get(n.id)
      if (!obj) {
        obj = { ...n }
        nodeMap.set(n.id, obj)
      } else {
        obj.kind = n.kind
        obj.label = n.label
        obj.status = n.status
        obj.sessionId = n.sessionId
      }
      seen.add(n.id)
      nodes.push(obj)
    }
    for (const id of nodeMap.keys()) {
      if (!seen.has(id)) nodeMap.delete(id)
    }

    // Fresh link objects every pass — force-graph mutates .source/.target
    // into node references in place, so the canonical id list must stay clean.
    const links: AgentSimLink[] = data.links.map((l) => ({ source: l.source, target: l.target }))

    graph.graphData({ nodes, links })
    agentMatchesRef.current = matchNodes(
      nodes.map((n) => ({ id: n.id, label: n.label })),
      agentQueryRef.current,
    )
    setAgentNodeCount(nodes.length)
  }, [])

  const deriveAndPushAgentGraph = useCallback(() => {
    const { sessions, updates, pendingPermissions } = agentInputsRef.current
    pushAgentGraphData(deriveAgentGraph(sessions, updates, pendingPermissions))
  }, [pushAgentGraphData])

  const scheduleAgentDerive = useCallback(() => {
    const now = Date.now()
    const elapsed = now - agentLastDeriveAtRef.current
    if (elapsed >= 100) {
      agentLastDeriveAtRef.current = now
      deriveAndPushAgentGraph()
      return
    }
    if (agentDeriveTimerRef.current) return
    agentDeriveTimerRef.current = setTimeout(() => {
      agentDeriveTimerRef.current = null
      agentLastDeriveAtRef.current = Date.now()
      deriveAndPushAgentGraph()
    }, 100 - elapsed)
  }, [deriveAndPushAgentGraph])

  useEffect(() => {
    agentInputsRef.current = {
      sessions: agentSessions,
      updates: agentUpdates,
      pendingPermissions: agentPendingPermissions,
    }
    scheduleAgentDerive()
  }, [agentSessions, agentUpdates, agentPendingPermissions, scheduleAgentDerive])

  useEffect(() => {
    return () => {
      if (agentDeriveTimerRef.current) clearTimeout(agentDeriveTimerRef.current)
    }
  }, [])

  // Mount the agent-mode force-graph instance once, alongside (not instead
  // of) the file-mode one — both containers live under wrapperRef and are
  // toggled via visibility so force-graph always has real dimensions.
  useEffect(() => {
    if (!wrapperRef.current) return
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;inset:0;'
    wrapperRef.current.appendChild(el)
    agentGraphElRef.current = el

    const { width, height } = el.getBoundingClientRect()

    // Cast to `any`: unlike file-mode's builder chain (typed via
    // src/types/force-graph.d.ts), agent-mode uses a few force-graph methods
    // that shim doesn't declare (nodePointerAreaPaint, onNodeHover,
    // 'replace' canvas mode). Not touching the shim's typing approach here.
    const graph = (ForceGraph2D()(el) as any)
      .graphData({ nodes: [], links: [] })
      .width(width)
      .height(height)
      .backgroundColor('rgba(0,0,0,0)') // pane root already paints var(--bg-surface)
      .autoPauseRedraw(false) // keep redrawing so the blocked-node pulse animates
      .nodeLabel(() => '') // labels are drawn on canvas, not via native tooltip
      .nodeRelSize(4)
      .linkColor(() => AGENT_LINK_COLOR)
      .linkWidth(1)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(() => AGENT_STATUS_COLOR.active)
      .linkDirectionalParticles((link: any) => {
        // Live activity flows only into tool/file nodes that are currently active.
        const target = resolveAgentNode(link.target)
        return target?.status === 'active' ? 2 : 0
      })
      .nodeCanvasObjectMode(() => 'replace')
      .nodeCanvasObject((node: AgentSimNode, ctx: CanvasRenderingContext2D) => {
        const selected = selectedSessionIdRef.current
        const hasQuery = agentQueryRef.current.trim().length > 0
        const matches = agentMatchesRef.current.has(node.id)
        const dimmed =
          (node.kind !== 'file' && !!selected && node.sessionId !== selected) || (hasQuery && !matches)
        const x = node.x ?? 0
        const y = node.y ?? 0
        const r = agentNodeRadius(node.kind)
        const color = AGENT_STATUS_COLOR[node.status]

        ctx.save()
        ctx.globalAlpha = dimmed ? AGENT_DIM_ALPHA : 1

        if (node.kind === 'file') {
          ctx.beginPath()
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(x - r, y - r, r * 2, r * 2, 1.5)
          } else {
            ctx.rect(x - r, y - r, r * 2, r * 2)
          }
          ctx.fillStyle = color
          ctx.fill()
        } else {
          ctx.beginPath()
          ctx.arc(x, y, r, 0, 2 * Math.PI)
          ctx.fillStyle = color
          ctx.fill()
          if (node.kind === 'agent') {
            ctx.lineWidth = 2
            ctx.strokeStyle = color
            ctx.stroke()
          }
        }

        if (node.kind === 'agent' && selected && node.sessionId === selected) {
          ctx.beginPath()
          ctx.arc(x, y, r + 3, 0, 2 * Math.PI)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = AGENT_ACCENT_COLOR
          ctx.stroke()
        }

        if (node.status === 'blocked') {
          const pulse = 0.35 + 0.45 * Math.abs(Math.sin(performance.now() / 320))
          ctx.beginPath()
          ctx.arc(x, y, r + 4, 0, 2 * Math.PI)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = AGENT_STATUS_COLOR.blocked
          ctx.globalAlpha = (dimmed ? AGENT_DIM_ALPHA : 1) * pulse
          ctx.stroke()
          ctx.globalAlpha = dimmed ? AGENT_DIM_ALPHA : 1
        }

        const showLabel = node.kind === 'agent' || agentHoveredIdRef.current === node.id || matches
        if (showLabel) {
          ctx.font = '11px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = matches ? 'rgba(240,240,245,0.95)' : AGENT_LABEL_COLOR
          ctx.fillText(node.label, x, y + r + 3)
        }

        ctx.restore()
      })
      .nodePointerAreaPaint((node: AgentSimNode, color: string, ctx: CanvasRenderingContext2D) => {
        const x = node.x ?? 0
        const y = node.y ?? 0
        const r = agentNodeRadius(node.kind) + 2
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI)
        ctx.fill()
      })
      .onNodeHover((node: AgentSimNode | null) => {
        agentHoveredIdRef.current = node?.id ?? null
      })
      .onNodeClick((node: AgentSimNode) => {
        if (node.kind === 'agent' && node.sessionId) {
          selectSessionRef.current(node.sessionId)
        }
      })
      .warmupTicks(30)
      .cooldownTime(4000)

    agentGraphRef.current = graph

    return () => {
      graph._destructor()
      agentGraphRef.current = null
      el.remove()
      agentGraphElRef.current = null
      agentNodeMapRef.current.clear()
    }
  }, [])

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

  // Toggle the two graph containers via visibility (not display:none, so
  // force-graph always sees real dimensions) — mirrors the app-wide "never
  // unmount, show/hide" pane pattern for the two source views within this pane.
  useEffect(() => {
    const filesVisible = source === 'files'
    if (graphElRef.current) {
      graphElRef.current.style.visibility = filesVisible ? 'visible' : 'hidden'
      graphElRef.current.style.pointerEvents = filesVisible ? 'auto' : 'none'
    }
    if (agentGraphElRef.current) {
      agentGraphElRef.current.style.visibility = filesVisible ? 'hidden' : 'visible'
      agentGraphElRef.current.style.pointerEvents = filesVisible ? 'none' : 'auto'
    }
  }, [source])

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
        if (agentGraphRef.current && agentGraphElRef.current) {
          const { width, height } = agentGraphElRef.current.getBoundingClientRect()
          agentGraphRef.current.width(width).height(height)
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
        {source === 'files' && loading && (
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
        {source === 'files' && !workspacePath && (
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
        {source === 'agents' && agentSessions.length === 0 && (
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
            <span style={{ fontSize: 13 }}>
              {available === false ? 'agents unavailable' : 'no agent sessions — spawn one to see the graph'}
            </span>
          </div>
        )}
        {/* Search + depth controls */}
        <div className="graph-controls">
          {/* Files | Agents source toggle */}
          <div
            style={{
              display: 'flex',
              border: '1px solid var(--border-mid)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => selectSource('files')}
              aria-pressed={source === 'files'}
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-ui)',
                padding: '4px 8px',
                border: 'none',
                cursor: 'pointer',
                background: source === 'files' ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                color: source === 'files' ? 'var(--accent-bright)' : 'var(--text-secondary)',
              }}
            >
              Files
            </button>
            <button
              type="button"
              onClick={() => selectSource('agents')}
              aria-pressed={source === 'agents'}
              style={{
                fontSize: 12,
                fontFamily: 'var(--font-ui)',
                padding: '4px 8px',
                borderLeft: '1px solid var(--border-mid)',
                cursor: 'pointer',
                background: source === 'agents' ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                color: source === 'agents' ? 'var(--accent-bright)' : 'var(--text-secondary)',
              }}
            >
              Agents
            </button>
          </div>
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
          {/* Depth filtering only applies to the file-mode local view — kept
              in the layout (visibility:hidden, not removed) in agents mode
              so the control row never jumps on toggle. */}
          <select
            className="graph-depth"
            value={String(depth)}
            onChange={(e) =>
              setDepth(e.target.value === 'all' ? 'all' : (Number(e.target.value) as 1 | 2 | 3))
            }
            title="Show nodes within N links of the focused node"
            style={source === 'agents' ? { visibility: 'hidden', pointerEvents: 'none' } : undefined}
          >
            <option value="all">depth: all</option>
            <option value="1">depth: 1</option>
            <option value="2">depth: 2</option>
            <option value="3">depth: 3</option>
          </select>
          {source === 'files' && root && (
            <button type="button" className="graph-root-chip" onClick={clearRoot} title="Clear focus">
              {root.label} <X size={11} />
            </button>
          )}
          {source === 'files' ? (
            <span className="graph-count" data-node-count={visibleCount.shown}>
              {visibleCount.shown === visibleCount.total
                ? `${visibleCount.total} nodes`
                : `${visibleCount.shown} / ${visibleCount.total} nodes`}
            </span>
          ) : (
            <span className="graph-count" data-node-count={agentNodeCount}>
              {agentNodeCount} nodes
            </span>
          )}
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
