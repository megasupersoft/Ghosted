// Live force-directed graph of running agents, their tool calls, and the
// files they touch. Canvas 2D via `force-graph`, mounted once and fed merged
// (identity-preserving) node objects on every re-derive so the simulation
// never resets positions from under the user.

import ForceGraph from 'force-graph'
import { useEffect, useMemo, useRef } from 'react'
import { deriveGraph } from '../lib/deriveGraph'
import type { GraphNode, PermissionRequest, SessionMeta, UpdateRecord } from '../../shared/protocol'

interface SimNode extends GraphNode {
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
}

interface AgentGraphProps {
  sessions: SessionMeta[]
  updates: UpdateRecord[]
  pendingPermissions: PermissionRequest[]
  selectedSessionId: string | null
  onSelectSession: (id: string) => void
}

const STATUS_COLOR: Record<GraphNode['status'], string> = {
  active: '#7ee8c7',
  blocked: '#e8b45a',
  error: '#e87070',
  done: '#55636f',
  idle: '#3a4653',
}

const LINK_COLOR = '#2a3441'
const LABEL_COLOR = '#8b96a5'
const ACCENT_COLOR = '#e8edf2'
const DIM_ALPHA = 0.4

const AGENT_RADIUS = 9
const TOOL_RADIUS = 5
const FILE_HALF_SIZE = 4

function radiusFor(kind: GraphNode['kind']): number {
  if (kind === 'agent') return AGENT_RADIUS
  if (kind === 'tool') return TOOL_RADIUS
  return FILE_HALF_SIZE
}

function resolveNode(ref: string | SimNode | undefined): SimNode | undefined {
  return typeof ref === 'object' ? ref : undefined
}

// File nodes are the shared convergence point across sessions — never dim
// them, so the "two agents touching the same file" moment stays legible.
function isDimmed(node: SimNode, selectedSessionId: string | null): boolean {
  if (!selectedSessionId) return false
  if (node.kind === 'file') return false
  return node.sessionId !== selectedSessionId
}

export default function AgentGraph({
  sessions,
  updates,
  pendingPermissions,
  selectedSessionId,
  onSelectSession,
}: AgentGraphProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const graphElRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<ForceGraph<SimNode, SimLink> | null>(null)
  const nodeMapRef = useRef(new Map<string, SimNode>())
  const selectedSessionIdRef = useRef<string | null>(selectedSessionId)
  const onSelectSessionRef = useRef(onSelectSession)
  const hoveredIdRef = useRef<string | null>(null)

  const graphData = useMemo(
    () => deriveGraph(sessions, updates, pendingPermissions),
    [sessions, updates, pendingPermissions],
  )

  useEffect(() => {
    selectedSessionIdRef.current = selectedSessionId
  }, [selectedSessionId])

  useEffect(() => {
    onSelectSessionRef.current = onSelectSession
  }, [onSelectSession])

  // Mount force-graph exactly once; all mutable inputs (selection, click
  // handler, hover) are read through refs so this effect never re-runs.
  useEffect(() => {
    if (!wrapperRef.current) return
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;inset:0;'
    wrapperRef.current.appendChild(el)
    graphElRef.current = el

    const { width, height } = el.getBoundingClientRect()

    const graph = new ForceGraph<SimNode, SimLink>(el)
      .width(width)
      .height(height)
      .backgroundColor('rgba(0,0,0,0)') // parent pane supplies #0e1116
      .autoPauseRedraw(false) // keep redrawing every frame so the blocked pulse animates
      .nodeLabel(() => '') // no native tooltip — labels are drawn on canvas
      .linkColor(LINK_COLOR)
      .linkWidth(1)
      .linkDirectionalParticleWidth(2)
      .linkDirectionalParticleColor(STATUS_COLOR.active)
      .linkDirectionalParticleSpeed(0.006)
      .linkDirectionalParticles((link) => {
        // Live activity flows only into tool/file nodes that are currently active.
        const target = resolveNode(link.target)
        return target?.status === 'active' ? 2 : 0
      })
      .nodeCanvasObject((node, ctx) => {
        const selected = selectedSessionIdRef.current
        const dimmed = isDimmed(node, selected)
        const x = node.x ?? 0
        const y = node.y ?? 0
        const r = radiusFor(node.kind)
        const color = STATUS_COLOR[node.status]

        ctx.save()
        ctx.globalAlpha = dimmed ? DIM_ALPHA : 1

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
          ctx.strokeStyle = ACCENT_COLOR
          ctx.stroke()
        }

        if (node.status === 'blocked') {
          const pulse = 0.35 + 0.45 * Math.abs(Math.sin(performance.now() / 320))
          ctx.beginPath()
          ctx.arc(x, y, r + 4, 0, 2 * Math.PI)
          ctx.lineWidth = 1.5
          ctx.strokeStyle = STATUS_COLOR.blocked
          ctx.globalAlpha = (dimmed ? DIM_ALPHA : 1) * pulse
          ctx.stroke()
          ctx.globalAlpha = dimmed ? DIM_ALPHA : 1
        }

        const showLabel = node.kind === 'agent' || hoveredIdRef.current === node.id
        if (showLabel) {
          ctx.font = '11px ui-monospace, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillStyle = LABEL_COLOR
          ctx.fillText(node.label, x, y + r + 3)
        }

        ctx.restore()
      })
      .nodePointerAreaPaint((node, color, ctx) => {
        const x = node.x ?? 0
        const y = node.y ?? 0
        const r = radiusFor(node.kind) + 2
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(x, y, r, 0, 2 * Math.PI)
        ctx.fill()
      })
      .onNodeHover((node) => {
        hoveredIdRef.current = node?.id ?? null
      })
      .onNodeClick((node) => {
        if (node.kind === 'agent' && node.sessionId) {
          onSelectSessionRef.current(node.sessionId)
        }
        // tool/file nodes: no-op for now (MVP)
      })
      .warmupTicks(30)
      .cooldownTime(4000)

    graphRef.current = graph

    return () => {
      graph._destructor()
      graphRef.current = null
      el.remove()
      graphElRef.current = null
      nodeMapRef.current.clear()
    }
  }, [])

  // Push derived data in, reusing existing node objects by id so force-graph
  // keeps their simulated x/y instead of restarting layout every tick.
  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    const nodeMap = nodeMapRef.current
    const seen = new Set<string>()
    const nodes: SimNode[] = []
    for (const n of graphData.nodes) {
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
    const links: SimLink[] = graphData.links.map((l) => ({ source: l.source, target: l.target }))

    graph.graphData({ nodes, links })
  }, [graphData])

  // Keep the canvas sized to its container.
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
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
    ro.observe(wrapper)
    return () => {
      clearTimeout(timer)
      ro.disconnect()
    }
  }, [])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }} />
      {sessions.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8b96a5',
            fontSize: 13,
            fontFamily: 'ui-monospace, monospace',
            pointerEvents: 'none',
          }}
        >
          The graph is empty — spawn an agent.
        </div>
      )}
    </div>
  )
}
