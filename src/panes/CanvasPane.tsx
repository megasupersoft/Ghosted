import React, { useCallback, useState, useRef, useEffect, memo } from 'react'
import {
  ReactFlow, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, Connection, MarkerType,
  useReactFlow, ReactFlowProvider, Handle, Position,
  SelectionMode, NodeResizer,
  type Node, type Edge, type NodeProps, type XYPosition,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

// Override ReactFlow selection box styles
const canvasStyles = document.createElement('style')
canvasStyles.textContent = `
  .react-flow__selection {
    background: rgba(139, 124, 248, 0.08) !important;
    border: 1.5px dashed #8b7cf8 !important;
    border-radius: 4px !important;
  }
  .react-flow__nodesselection-rect {
    background: rgba(139, 124, 248, 0.06) !important;
    border: 1.5px dashed #8b7cf8 !important;
    border-radius: 4px !important;
  }
`
document.head.appendChild(canvasStyles)
import { useGhostDB } from '@/lib/useGhostDB'
import { useStore } from '@/store'
import type { GhostedQuery } from '@/types/electron'

// ─── Node types ──────────────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export interface GhostedNodeData extends Record<string, unknown> {
  label: string
  nodeType: 'prompt' | 'skill' | 'context' | 'terminal' | 'output' | 'note' | 'group' | 'run'
  // prompt node
  prompt?: string
  // skill node
  skillPath?: string
  // context node — queries GhostedDB
  query?: GhostedQuery
  injectFields?: string[]   // frontmatter fields to include, default: all
  // terminal node
  command?: string
  // note node
  noteText?: string
  // group node
  groupColor?: string
  // runtime status
  status?: NodeStatus
  result?: string
  // run node — callback set by CanvasInner
  onRun?: (nodeId: string) => void
}

const STATUS_COLOR: Record<NodeStatus, string> = {
  idle:    '#8b7cf8',
  running: '#fbbf24',
  done:    '#4ade80',
  error:   '#f87171',
}

const TYPE_COLOR: Record<GhostedNodeData['nodeType'], string> = {
  prompt:   '#8b7cf8',
  skill:    '#c084fc',
  context:  '#67e8f9',
  terminal: '#4ade80',
  output:   '#fbbf24',
  note:     '#e8d590',
  group:    '#444',
  run:      '#f97316',
}

// ─── Custom node component ────────────────────────────────────────────────────

const GhostedNode = memo(({ data, selected }: NodeProps) => {
  const d = data as GhostedNodeData
  const status = d.status ?? 'idle'
  const color = STATUS_COLOR[status]
  const typeColor = TYPE_COLOR[d.nodeType]

  return (
    <div style={{
      background: `${typeColor}12`,
      border: `1.5px solid ${selected ? '#fff' : color}`,
      borderRadius: 8,
      padding: '8px 14px',
      minWidth: 150,
      maxWidth: 260,
      color: '#e2e2f0',
      fontSize: 12,
      position: 'relative',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: status === 'running' ? `0 0 12px ${color}88` : undefined,
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: '#555', border: '1.5px solid #888', width: 8, height: 8 }} />

      {/* Type badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 2,
          background: typeColor, flexShrink: 0,
          boxShadow: status === 'running' ? `0 0 6px ${color}` : undefined,
        }} />
        <span style={{ fontSize: 10, color: typeColor, textTransform: 'uppercase', letterSpacing: 1 }}>
          {d.nodeType}
        </span>
        {status !== 'idle' && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color }}>
            {status === 'running' ? '⟳' : status === 'done' ? '✓' : '✗'}
          </span>
        )}
      </div>

      {/* Label */}
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: d.prompt || d.command || d.skillPath || d.query ? 4 : 0 }}>
        {d.label}
      </div>

      {/* Preview */}
      {d.prompt && (
        <div style={{ fontSize: 11, color: '#aaa', overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {d.prompt}
        </div>
      )}
      {d.skillPath && (
        <div style={{ fontSize: 10, color: '#888', fontFamily: 'monospace' }}>
          {d.skillPath.split('/').pop()}
        </div>
      )}
      {d.query && (
        <div style={{ fontSize: 10, color: '#888' }}>
          DB query: {d.query.where?.map(w => `${w.field}`).join(', ') || 'all files'}
        </div>
      )}
      {d.command && (
        <div style={{ fontSize: 10, color: '#4ade80', fontFamily: 'monospace' }}>
          $ {d.command}
        </div>
      )}

      {/* Result preview */}
      {d.result && status === 'done' && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#4ade8088', overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {d.result}
        </div>
      )}

      <Handle type="source" position={Position.Bottom}
        style={{ background: '#555', border: '1.5px solid #888', width: 8, height: 8 }} />
    </div>
  )
})

// ─── Note node ───────────────────────────────────────────────────────────────

const NoteNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as GhostedNodeData
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(d.noteText || d.label)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const flow = useReactFlow()

  // Sync from external data changes
  useEffect(() => { setText(d.noteText || d.label) }, [d.noteText, d.label])

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.select()
    }
  }, [editing])

  const commit = () => {
    setEditing(false)
    flow.setNodes(ns => ns.map(n =>
      n.id === id ? { ...n, data: { ...n.data, noteText: text } } : n
    ))
  }

  return (
    <div
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true) }}
      style={{
        background: '#2a2518',
        border: `1.5px solid ${selected ? '#fff' : '#4a421e'}`,
        borderRadius: 8,
        padding: '10px 14px',
        minWidth: 140,
        maxWidth: 300,
        color: '#e8d590',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
      }}
    >
      <div style={{ fontSize: 9, color: '#a08830', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        Note
      </div>
      {editing ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') commit() }}
          style={{
            width: '100%', minHeight: 40, resize: 'vertical',
            background: 'transparent', border: 'none', outline: 'none',
            color: '#e8d590', fontSize: 12, lineHeight: 1.5,
            fontFamily: 'inherit', padding: 0,
          }}
        />
      ) : (
        <div style={{ fontStyle: 'italic' }}>{text}</div>
      )}
    </div>
  )
})

// ─── Group node ──────────────────────────────────────────────────────────────

const GroupNode = memo(({ data, selected }: NodeProps) => {
  const d = data as GhostedNodeData
  const color = d.groupColor || '#666'
  return (
    <div style={{
      background: 'rgba(10, 10, 16, 0.75)',
      border: `1.5px solid ${selected ? '#fff' : '#2a2a35'}`,
      borderRadius: 8,
      width: '100%',
      height: '100%',
      position: 'relative',
    }}>
      <NodeResizer
        isVisible={!!selected}
        minWidth={200} minHeight={120}
        lineStyle={{ borderColor: '#2a2a35' }}
        handleStyle={{ background: '#444', border: '1px solid #666', width: 8, height: 8, borderRadius: 2 }}
      />
      {/* Header bar — matches other node badge style */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px',
        borderBottom: `1px solid ${color}22`,
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 2,
          background: color, flexShrink: 0,
        }} />
        <span style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1 }}>
          group
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e2f0', marginLeft: 4 }}>
          {d.label}
        </span>
      </div>
    </div>
  )
})

// ─── Run node ────────────────────────────────────────────────────────────────

const RunNode = memo(({ id, data, selected }: NodeProps) => {
  const d = data as GhostedNodeData
  const status = d.status ?? 'idle'
  const isRunning = status === 'running'
  const color = TYPE_COLOR.run

  return (
    <div style={{
      background: `${color}12`,
      border: `1.5px solid ${selected ? '#fff' : isRunning ? '#fbbf24' : color}`,
      borderRadius: 8,
      padding: '8px 14px',
      minWidth: 150,
      color: '#e2e2f0',
      fontSize: 12,
      position: 'relative',
      transition: 'border-color 0.2s, box-shadow 0.2s',
      boxShadow: isRunning ? `0 0 12px #fbbf2488` : undefined,
    }}>
      <Handle type="target" position={Position.Top}
        style={{ background: '#555', border: '1.5px solid #888', width: 8, height: 8 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{
          width: 7, height: 7, borderRadius: 2,
          background: color, flexShrink: 0,
        }} />
        <span style={{ fontSize: 10, color, textTransform: 'uppercase', letterSpacing: 1 }}>
          run
        </span>
        {status !== 'idle' && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: STATUS_COLOR[status] }}>
            {isRunning ? '⟳' : status === 'done' ? '✓' : '✗'}
          </span>
        )}
      </div>

      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
        {d.label}
      </div>

      <button
        onClick={(e) => { e.stopPropagation(); d.onRun?.(id) }}
        disabled={isRunning}
        style={{
          width: '100%',
          padding: '4px 12px', borderRadius: 4, fontSize: 11, fontWeight: 600,
          background: isRunning ? '#fbbf2422' : `${color}22`,
          color: isRunning ? '#fbbf24' : color,
          border: `1px solid ${isRunning ? '#fbbf24' : color}44`,
          cursor: isRunning ? 'not-allowed' : 'pointer',
          transition: 'background 0.15s',
        }}
      >
        {isRunning ? '⟳ Running…' : '▶ Run'}
      </button>

      {d.result && status === 'done' && (
        <div style={{ marginTop: 4, fontSize: 10, color: '#4ade8088', overflow: 'hidden',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {d.result}
        </div>
      )}
    </div>
  )
})

const nodeTypes = { ghosted: GhostedNode, note: NoteNode, group: GroupNode, run: RunNode }

// ─── Workflow serialiser ─────────────────────────────────────────────────────

async function resolveNode(
  node: Node,
  previousOutput: string,
  query: (q: GhostedQuery) => Promise<{ files: { name: string; frontmatter: Record<string,unknown>; body: string }[]; total: number; took: number }>,
  readFile: (p: string) => Promise<string>,
): Promise<string> {
  const d = node.data as GhostedNodeData

  switch (d.nodeType) {
    case 'prompt':
      return [previousOutput, d.prompt ?? ''].filter(Boolean).join('\n\n---\n\n')

    case 'skill': {
      if (!d.skillPath) return previousOutput
      try {
        const content = await readFile(d.skillPath)
        const body = content.replace(/^---[\s\S]*?---\n/, '').trim()
        return [previousOutput, body].filter(Boolean).join('\n\n---\n\n')
      } catch {
        return previousOutput
      }
    }

    case 'context': {
      if (!d.query) return previousOutput
      const result = await query(d.query)
      if (result.total === 0) return previousOutput

      const lines: string[] = [`## Context (${result.total} files from workspace)\n`]
      for (const f of result.files.slice(0, 20)) {
        lines.push(`### ${f.name}`)
        if (Object.keys(f.frontmatter).length > 0) {
          const fields = d.injectFields ?? Object.keys(f.frontmatter)
          for (const k of fields) {
            if (f.frontmatter[k] !== undefined) lines.push(`**${k}**: ${f.frontmatter[k]}`)
          }
        }
        if (f.body.trim()) lines.push('', f.body.slice(0, 800).trim())
        lines.push('')
      }
      return [previousOutput, lines.join('\n')].filter(Boolean).join('\n\n---\n\n')
    }

    case 'terminal':
    case 'output':
    case 'note':
    case 'group':
    case 'run':
      return previousOutput

    default:
      return previousOutput
  }
}

// Topological sort of nodes following edges (only among given node set)
function topoSort(nodes: Node[], edges: Edge[]): Node[] {
  const nodeIds = new Set(nodes.map(n => n.id))
  const relevant = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target))
  const adj = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0) }
  for (const e of relevant) {
    adj.get(e.source)?.push(e.target)
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
  }
  const queue = nodes.filter(n => (inDeg.get(n.id) ?? 0) === 0)
  const result: Node[] = []
  while (queue.length > 0) {
    const n = queue.shift()!
    result.push(n)
    for (const next of adj.get(n.id) ?? []) {
      const deg = (inDeg.get(next) ?? 1) - 1
      inDeg.set(next, deg)
      if (deg === 0) queue.push(nodes.find(x => x.id === next)!)
    }
  }
  return result.filter(Boolean)
}

// Walk backwards from a node to collect all upstream ancestors
function collectUpstream(nodeId: string, allNodes: Node[], allEdges: Edge[]): Node[] {
  const visited = new Set<string>()
  const queue = [nodeId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of allEdges) {
      if (edge.target === current && !visited.has(edge.source)) {
        queue.push(edge.source)
      }
    }
  }
  return allNodes.filter(n => visited.has(n.id))
}

// ─── Default workflow (New Feature) ──────────────────────────────────────────

const mkNode = (id: string, label: string, nodeType: GhostedNodeData['nodeType'],
  extra: Partial<GhostedNodeData>, pos: {x:number;y:number}): Node => ({
  id,
  type: nodeType === 'note' ? 'note' : nodeType === 'group' ? 'group' : nodeType === 'run' ? 'run' : 'ghosted',
  position: pos,
  data: { label, nodeType, status: 'idle' as NodeStatus, ...extra },
  ...(nodeType === 'group' ? {
    style: { width: 340, height: 400, padding: 0, borderRadius: 8, overflow: 'hidden' },
    zIndex: -1,
  } : {}),
})

const INITIAL_NODES: Node[] = [
  mkNode('ctx',  'Workspace Context', 'context',  { query: { ext: '.md', where: [{ field: 'status', op: 'exists' }], orderBy: 'mtime', orderDir: 'desc', limit: 10 } }, { x: 60, y: 0 }),
  mkNode('brief','Brief',             'skill',    { skillPath: '.claude/skills/brief/SKILL.md'  }, { x: 60, y: 140 }),
  mkNode('arch', 'Arch',              'skill',    { skillPath: '.claude/skills/arch/SKILL.md'   }, { x: 60, y: 280 }),
  mkNode('impl', 'Implement',         'prompt',   { prompt: 'Implement the feature. TypeScript, follow CLAUDE.md conventions. No any without comment.' }, { x: 60, y: 420 }),
  mkNode('rev',  'Review',            'skill',    { skillPath: '.claude/skills/review/SKILL.md' }, { x: 60, y: 560 }),
  mkNode('ship', 'Ship',              'skill',    { skillPath: '.claude/skills/ship/SKILL.md'   }, { x: 60, y: 700 }),
  mkNode('run1', 'Run Workflow',      'run',      {},                                              { x: 60, y: 840 }),
]

const mkEdge = (s: string, t: string): Edge => ({
  id: `e-${s}-${t}`, source: s, target: t, animated: true,
  style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
})

const INITIAL_EDGES: Edge[] = [
  mkEdge('ctx','brief'), mkEdge('brief','arch'), mkEdge('arch','impl'),
  mkEdge('impl','rev'), mkEdge('rev','ship'), mkEdge('ship','run1'),
]

let idCounter = 20

// ─── Canvas state persistence (file-based) ──────────────────────────────────

interface SavedCanvasState {
  nodes: Node[]
  edges: Edge[]
  idCounter: number
}

function serializeCanvas(nodes: Node[], edges: Edge[]): string {
  const cleanNodes = nodes.map(n => ({
    ...n,
    data: Object.fromEntries(
      Object.entries(n.data).filter(([k]) => k !== 'onRun' && k !== 'status' && k !== 'result')
    ),
  }))
  const state: SavedCanvasState = { nodes: cleanNodes, edges, idCounter }
  return JSON.stringify(state, null, 2)
}

function deserializeCanvas(raw: string): { nodes: Node[]; edges: Edge[] } | null {
  try {
    const state: SavedCanvasState = JSON.parse(raw)
    if (!state.nodes?.length) return null
    idCounter = state.idCounter ?? 20
    const nodes = state.nodes.map(n => ({
      ...n,
      data: { ...n.data, status: 'idle' as NodeStatus },
    }))
    return { nodes, edges: state.edges }
  } catch {
    return null
  }
}

// ─── Node palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  { nodeType: 'prompt'   as const, label: 'Prompt',   color: '#8b7cf8', desc: 'Text prompt for Claude' },
  { nodeType: 'skill'    as const, label: 'Skill',    color: '#c084fc', desc: 'Load a SKILL.md file'   },
  { nodeType: 'context'  as const, label: 'Context',  color: '#67e8f9', desc: 'Query workspace files'  },
  { nodeType: 'terminal' as const, label: 'Terminal', color: '#4ade80', desc: 'Run a shell command'    },
  { nodeType: 'output'   as const, label: 'Output',   color: '#fbbf24', desc: 'Capture final result'   },
  { nodeType: 'run'      as const, label: 'Run',      color: '#f97316', desc: 'Execute upstream workflow' },
  { nodeType: 'note'     as const, label: 'Note',     color: '#e8d590', desc: 'Sticky note'            },
  { nodeType: 'group'    as const, label: 'Group',    color: '#444',    desc: 'Group nodes together'   },
]

// ─── Edge-line intersection (for wire cutting) ───────────────────────────────

function segmentsIntersect(
  p1: XYPosition, p2: XYPosition,
  p3: XYPosition, p4: XYPosition,
): boolean {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y
  const cross = d1x * d2y - d1y * d2x
  if (Math.abs(cross) < 1e-10) return false
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / cross
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / cross
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

// ─── Cut line SVG overlay ────────────────────────────────────────────────────

function CutLineOverlay({ points }: { points: XYPosition[] }) {
  if (points.length < 2) return null
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ')
  return (
    <svg style={{ position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none' }}>
      <path d={d} fill="none" stroke="#f87171" strokeWidth={2} strokeDasharray="6 4" opacity={0.8} />
    </svg>
  )
}

// ─── Main canvas ─────────────────────────────────────────────────────────────

function CanvasInner({ filePath }: { filePath?: string }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [loaded, setLoaded] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null)
  const [runningSet, setRunningSet] = useState<Set<string>>(new Set())
  const [runLog, setRunLog] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const flow = useReactFlow()
  const { query } = useGhostDB()
  const { workspacePath } = useStore()
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  // Wire cutting state
  const [cutting, setCutting] = useState(false)
  const [cutPoints, setCutPoints] = useState<XYPosition[]>([])
  const [cutKeyActive, setCutKeyActive] = useState(false)
  const cutKeyHeld = useRef(false)
  const cuttingRef = useRef(false)

  // Refs for run callback to access latest state without re-creating node data
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

  // Load canvas from file on mount or when filePath changes
  useEffect(() => {
    if (!filePath) { setLoaded(true); return }
    let cancelled = false
    ;(async () => {
      try {
        const raw = await window.electron.fs.readfile(filePath)
        if (cancelled) return
        const parsed = deserializeCanvas(raw)
        if (parsed) {
          setNodes(parsed.nodes)
          setEdges(parsed.edges)
        }
      } catch {
        // File might be empty or new — use defaults
      }
      if (!cancelled) setLoaded(true)
    })()
    return () => { cancelled = true }
  }, [filePath])

  // Debounced save to .canvas file on disk
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => {
    if (!loaded) return // Don't save before initial load completes
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const fp = filePathRef.current
      if (fp) {
        window.electron.fs.writefile(fp, serializeCanvas(nodes, edges)).catch(() => {})
      }
    }, 500)
    return () => clearTimeout(saveTimer.current)
  }, [nodes, edges, loaded])

  const onConnect = useCallback((c: Connection) =>
    setEdges(eds => addEdge({
      ...c, animated: true,
      style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
    }, eds)), [setEdges])

  const setNodeStatus = useCallback((id: string, status: NodeStatus, result?: string) => {
    setNodes(ns => ns.map(n => n.id === id
      ? { ...n, data: { ...n.data, status, ...(result !== undefined ? { result } : {}) } }
      : n))
  }, [setNodes])

  // ── Delete selected nodes/edges ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return

        const selectedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id))
        if (selectedNodeIds.size > 0) {
          setNodes(ns => ns.filter(n => !selectedNodeIds.has(n.id)))
          setEdges(es => es.filter(e => !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)))
          return
        }
        setEdges(es => es.filter(e => !e.selected))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nodes, setNodes, setEdges])

  // ── Wire cutting: key listeners ──────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C' || e.key === 'y' || e.key === 'Y') {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        cutKeyHeld.current = true
        setCutKeyActive(true)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'c' || e.key === 'C' || e.key === 'y' || e.key === 'Y') {
        cutKeyHeld.current = false
        setCutKeyActive(false)
        if (cutting) {
          finishCut()
        }
      }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [cutting, cutPoints, edges, nodes])

  // ── Wire cutting: mouse handlers (capture phase to beat ReactFlow) ────
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return

    const handleDown = (e: PointerEvent) => {
      if (cutKeyHeld.current && e.button === 0) {
        e.preventDefault()
        e.stopPropagation()
        const bounds = el.getBoundingClientRect()
        const pt = { x: e.clientX - bounds.left, y: e.clientY - bounds.top }
        cuttingRef.current = true
        setCutting(true)
        setCutPoints([pt])
      }
    }

    const handleMove = (e: PointerEvent) => {
      if (!cuttingRef.current) return
      const bounds = el.getBoundingClientRect()
      const pt = { x: e.clientX - bounds.left, y: e.clientY - bounds.top }
      setCutPoints(prev => [...prev, pt])
    }

    const handleUp = () => {
      if (cuttingRef.current) {
        cuttingRef.current = false
      }
    }

    el.addEventListener('pointerdown', handleDown, true)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      el.removeEventListener('pointerdown', handleDown, true)
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [])

  const finishCut = useCallback(() => {
    if (cutPoints.length < 2) {
      setCutting(false)
      setCutPoints([])
      return
    }

    const wrapper = wrapperRef.current
    if (!wrapper) { setCutting(false); setCutPoints([]); return }
    const bounds = wrapper.getBoundingClientRect()

    const flowCutPoints = cutPoints.map(p =>
      flow.screenToFlowPosition({ x: p.x + bounds.left, y: p.y + bounds.top })
    )

    const edgesToRemove = new Set<string>()

    for (const edge of edges) {
      const sourceNode = nodes.find(n => n.id === edge.source)
      const targetNode = nodes.find(n => n.id === edge.target)
      if (!sourceNode || !targetNode) continue

      const sw = (sourceNode.measured?.width ?? 150) / 2
      const sh = (sourceNode.measured?.height ?? 40) / 2
      const tw = (targetNode.measured?.width ?? 150) / 2
      const th = (targetNode.measured?.height ?? 40) / 2

      const srcCenter: XYPosition = {
        x: sourceNode.position.x + sw,
        y: sourceNode.position.y + sh,
      }
      const tgtCenter: XYPosition = {
        x: targetNode.position.x + tw,
        y: targetNode.position.y + th,
      }

      for (let i = 0; i < flowCutPoints.length - 1; i++) {
        if (segmentsIntersect(flowCutPoints[i], flowCutPoints[i + 1], srcCenter, tgtCenter)) {
          edgesToRemove.add(edge.id)
          break
        }
      }
    }

    if (edgesToRemove.size > 0) {
      setEdges(es => es.filter(e => !edgesToRemove.has(e.id)))
    }

    setCutting(false)
    setCutPoints([])
  }, [cutPoints, edges, nodes, flow, setEdges])

  const onWrapperMouseUp = useCallback(() => {
    if (cutting) {
      finishCut()
    }
  }, [cutting, finishCut])

  // ── Run a workflow from a specific run node ─────────────────────────────
  const runFromNode = useCallback(async (runNodeId: string) => {
    if (runningSet.has(runNodeId) || !workspacePath) return
    setRunningSet(prev => new Set(prev).add(runNodeId))
    setRunLog([])

    const currentNodes = nodesRef.current
    const currentEdges = edgesRef.current

    // Collect all upstream nodes from this run node
    const upstream = collectUpstream(runNodeId, currentNodes, currentEdges)
    const sorted = topoSort(upstream, currentEdges)

    // Reset statuses for this subgraph
    const upstreamIds = new Set(upstream.map(n => n.id))
    setNodes(ns => ns.map(n => upstreamIds.has(n.id)
      ? { ...n, data: { ...n.data, status: 'idle', result: undefined } }
      : n))

    const log = (msg: string) => setRunLog(l => [...l, msg])
    let context = ''

    for (const node of sorted) {
      const d = node.data as GhostedNodeData
      if (d.nodeType === 'note' || d.nodeType === 'group' || d.nodeType === 'run') continue
      setNodeStatus(node.id, 'running')
      log(`▶ ${d.label}`)

      try {
        if (d.nodeType === 'terminal' && d.command) {
          const id = `canvas-${Date.now()}`
          await window.electron.pty.create(id, workspacePath)
          let output = ''
          await new Promise<void>((resolve) => {
            window.electron.pty.onData(id, (data) => { output += data })
            window.electron.pty.onExit(id, () => resolve())
            window.electron.pty.write(id, `${d.command}\n`)
            setTimeout(() => resolve(), 10000)
          })
          await window.electron.pty.kill(id)
          window.electron.pty.removeListeners(id)
          context = [context, `## Terminal output\n\`\`\`\n${output.trim()}\n\`\`\``].filter(Boolean).join('\n\n')
          setNodeStatus(node.id, 'done', output.trim().slice(0, 200))
        } else {
          const resolved = await resolveNode(node, context, query, window.electron.fs.readfile)
          context = resolved
          setNodeStatus(node.id, 'done', resolved.slice(-200))
        }
        log(`  ✓ ${d.label} done`)
      } catch (err) {
        setNodeStatus(node.id, 'error')
        log(`  ✗ ${d.label} error: ${err}`)
        setNodeStatus(runNodeId, 'error')
        setRunningSet(prev => { const s = new Set(prev); s.delete(runNodeId); return s })
        return
      }
    }

    // Final output
    log('\n─── Final prompt ready ───')
    log(`${context.length} chars | ${context.split('\n').length} lines`)

    const termId = `canvas-pi-${Date.now()}`
    try {
      await window.electron.pty.create(termId, workspacePath)
      const tmpPath = `${workspacePath}/.ghosted-workflow-prompt.md`
      await window.electron.fs.writefile(tmpPath, context)
      window.electron.pty.write(termId, `pi --print "$(cat .ghosted-workflow-prompt.md)"\n`)
      log('▶ Piped to pi — check terminal pane')
    } catch {
      await navigator.clipboard.writeText(context).catch(() => {})
      log('Copied to clipboard (pi not found)')
    }

    setNodeStatus(runNodeId, 'done', `${context.length} chars`)
    setRunningSet(prev => { const s = new Set(prev); s.delete(runNodeId); return s })
  }, [runningSet, workspacePath, query, setNodes, setNodeStatus])

  // Inject onRun callback into all run nodes
  useEffect(() => {
    setNodes(ns => {
      let changed = false
      const updated = ns.map(n => {
        if ((n.data as GhostedNodeData).nodeType === 'run' && (n.data as GhostedNodeData).onRun !== runFromNode) {
          changed = true
          return { ...n, data: { ...n.data, onRun: runFromNode } }
        }
        return n
      })
      return changed ? updated : ns
    })
  }, [runFromNode, setNodes])

  // Context menu — right-click
  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      e.preventDefault(); e.stopPropagation()
      const bounds = el.getBoundingClientRect()
      setMenu({ x: e.clientX - bounds.left, y: e.clientY - bounds.top,
        flowPos: flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }) })
    }
    el.addEventListener('contextmenu', handler, true)
    return () => el.removeEventListener('contextmenu', handler, true)
  }, [flow])

  // Close context menu on any click outside
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest?.('[data-canvas-menu]')) return
      setMenu(null)
    }
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', close, true)
    }, 0)
    return () => { clearTimeout(timer); window.removeEventListener('mousedown', close, true) }
  }, [menu])

  const addNode = (p: typeof PALETTE[0], pos: { x: number; y: number }) => {
    const id = String(++idCounter)
    const isGroup = p.nodeType === 'group'
    const isNote = p.nodeType === 'note'
    const isRun = p.nodeType === 'run'
    setNodes(ns => [...ns, {
      id,
      type: isNote ? 'note' : isGroup ? 'group' : isRun ? 'run' : 'ghosted',
      position: pos,
      data: {
        label: p.label, nodeType: p.nodeType, status: 'idle' as NodeStatus,
        ...(isNote ? { noteText: 'Double-click to edit' } : {}),
        ...(isGroup ? { groupColor: '#666' } : {}),
        ...(isRun ? { onRun: runFromNode } : {}),
      },
      ...(isGroup ? { style: { width: 340, height: 400, padding: 0, borderRadius: 8, overflow: 'hidden' }, zIndex: -1 } : {}),
    }])
    setMenu(null)
  }

  // ── Shake detection — track drag movement for direction reversals ─────
  const shakeHistory = useRef<{ id: string; xs: number[]; ts: number[] }>({ id: '', xs: [], ts: [] })

  const onNodeDrag = useCallback((_e: React.MouseEvent, draggedNode: Node) => {
    const now = Date.now()
    const h = shakeHistory.current

    // Reset if different node
    if (h.id !== draggedNode.id) {
      h.id = draggedNode.id
      h.xs = []
      h.ts = []
    }

    h.xs.push(draggedNode.position.x)
    h.ts.push(now)

    // Keep only last 500ms of history
    while (h.ts.length > 0 && now - h.ts[0] > 500) {
      h.ts.shift()
      h.xs.shift()
    }

    // Count direction reversals in x
    if (h.xs.length < 5) return
    let reversals = 0
    for (let i = 2; i < h.xs.length; i++) {
      const d1 = h.xs[i - 1] - h.xs[i - 2]
      const d2 = h.xs[i] - h.xs[i - 1]
      if ((d1 > 2 && d2 < -2) || (d1 < -2 && d2 > 2)) reversals++
    }

    // 3+ reversals in 500ms = shake
    if (reversals >= 3) {
      h.xs = []
      h.ts = []
      // Disconnect node and heal chains: reconnect sources to targets
      setEdges(es => {
        const incoming = es.filter(e => e.target === draggedNode.id)
        const outgoing = es.filter(e => e.source === draggedNode.id)
        const without = es.filter(e => e.source !== draggedNode.id && e.target !== draggedNode.id)

        // For each incoming→outgoing pair, create a bridge edge
        const bridges: Edge[] = []
        for (const inc of incoming) {
          for (const out of outgoing) {
            // Don't create duplicate edges
            const exists = without.some(e => e.source === inc.source && e.target === out.target)
            if (!exists) {
              bridges.push({
                id: `e-${inc.source}-${out.target}`,
                source: inc.source, target: out.target, animated: true,
                style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
              })
            }
          }
        }
        return [...without, ...bridges]
      })
    }
  }, [setEdges])

  // ── Drop node onto edge — splice into chain ────────────────────────────
  const getAbsolutePos = useCallback((node: Node, allNodes: Node[]): XYPosition => {
    let x = node.position.x
    let y = node.position.y
    if (node.parentId) {
      const parent = allNodes.find(n => n.id === node.parentId)
      if (parent) { x += parent.position.x; y += parent.position.y }
    }
    return { x, y }
  }, [])

  const spliceNodeOntoEdge = useCallback((draggedNode: Node) => {
    const nodeId = draggedNode.id
    const d = draggedNode.data as GhostedNodeData
    if (d.nodeType === 'group' || d.nodeType === 'note') return

    const allNodes = nodesRef.current
    const allEdges = edgesRef.current

    // Skip if node already has connections
    const hasEdges = allEdges.some(e => e.source === nodeId || e.target === nodeId)
    if (hasEdges) return

    // Get absolute center of dragged node
    const absPos = getAbsolutePos(draggedNode, allNodes)
    const nw = (draggedNode.measured?.width ?? 150) / 2
    const nh = (draggedNode.measured?.height ?? 40) / 2
    const cx = absPos.x + nw
    const cy = absPos.y + nh

    // Find closest edge within threshold
    const THRESHOLD = 40
    let bestEdge: Edge | null = null
    let bestDist = THRESHOLD

    for (const edge of allEdges) {
      const src = allNodes.find(n => n.id === edge.source)
      const tgt = allNodes.find(n => n.id === edge.target)
      if (!src || !tgt) continue

      const srcAbs = getAbsolutePos(src, allNodes)
      const tgtAbs = getAbsolutePos(tgt, allNodes)

      // Edge line: source center → target center
      const sx = srcAbs.x + (src.measured?.width ?? 150) / 2
      const sy = srcAbs.y + (src.measured?.height ?? 40) / 2
      const tx = tgtAbs.x + (tgt.measured?.width ?? 150) / 2
      const ty = tgtAbs.y + (tgt.measured?.height ?? 40) / 2

      // Point-to-segment distance
      const dx = tx - sx, dy = ty - sy
      const len2 = dx * dx + dy * dy
      if (len2 === 0) continue
      const t = Math.max(0, Math.min(1, ((cx - sx) * dx + (cy - sy) * dy) / len2))
      const px = sx + t * dx, py = sy + t * dy
      const dist = Math.sqrt((cx - px) * (cx - px) + (cy - py) * (cy - py))

      if (dist < bestDist) {
        bestDist = dist
        bestEdge = edge
      }
    }

    if (!bestEdge) return

    // Splice: remove old edge, add two new edges
    const oldSource = bestEdge.source
    const oldTarget = bestEdge.target
    setEdges(es => [
      ...es.filter(e => e.id !== bestEdge!.id),
      {
        id: `e-${oldSource}-${nodeId}`, source: oldSource, target: nodeId, animated: true,
        style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
      },
      {
        id: `e-${nodeId}-${oldTarget}`, source: nodeId, target: oldTarget, animated: true,
        style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
      },
    ])
  }, [setEdges, getAbsolutePos])

  // ── Group reparenting on drag stop ──────────────────────────────────────
  const onNodeDragStop = useCallback((_e: React.MouseEvent, draggedNode: Node) => {
    const d = draggedNode.data as GhostedNodeData
    if (d.nodeType === 'group') return

    // draggedNode.position from the callback is:
    //   - absolute if node has no parent
    //   - relative to parent if node has a parent
    const hadParent = !!draggedNode.parentId

    // We need to read groups from the latest nodes ref (not stale closure)
    const allNodes = nodesRef.current
    const groups = allNodes.filter(n => (n.data as GhostedNodeData).nodeType === 'group' && n.id !== draggedNode.id)

    // Compute absolute position of dragged node
    let absX = draggedNode.position.x
    let absY = draggedNode.position.y
    if (hadParent) {
      const oldParent = allNodes.find(n => n.id === draggedNode.parentId)
      if (oldParent) {
        absX += oldParent.position.x
        absY += oldParent.position.y
      }
    }

    // Find which group (if any) the node landed in
    let newParent: Node | null = null
    for (const g of groups) {
      const gw = (g.style?.width as number) ?? (g.measured?.width ?? 340)
      const gh = (g.style?.height as number) ?? (g.measured?.height ?? 400)
      if (absX >= g.position.x && absX <= g.position.x + gw &&
          absY >= g.position.y && absY <= g.position.y + gh) {
        newParent = g
        break
      }
    }

    const newParentId = newParent?.id ?? null
    const oldParentId = draggedNode.parentId ?? null

    // No change needed
    if (oldParentId === newParentId) return

    setNodes(ns => ns.map(n => {
      if (n.id !== draggedNode.id) return n
      if (newParentId && newParent) {
        // Moving into a group — set relative position
        return {
          ...n,
          parentId: newParentId,
          position: { x: absX - newParent.position.x, y: absY - newParent.position.y },
        }
      } else {
        // Moving out of a group — set absolute position
        const { parentId, extent, ...rest } = n as any
        return { ...rest, position: { x: absX, y: absY } }
      }
    }))

    // Also check if node was dropped onto an edge to splice in
    spliceNodeOntoEdge(draggedNode)
  }, [setNodes, spliceNodeOntoEdge])

  const onPaneClick = useCallback(() => {
    setMenu(null)
  }, [])

  return (
    <div
      ref={wrapperRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative',
        cursor: cutKeyActive ? 'crosshair' : undefined }}
      onMouseUp={() => { if (cutting) finishCut() }}
    >

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} fitView
          nodeTypes={nodeTypes}
          onPaneClick={onPaneClick}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          panOnDrag={[1]}
          selectionOnDrag={!cutKeyActive}
          selectionMode={SelectionMode.Partial}
          nodesDraggable
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
          style={{ background: '#0e0e16' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a2e" variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>

        {/* Cut line overlay */}
        {cutting && <CutLineOverlay points={cutPoints} />}

        {/* Context menu */}
        {menu && (
          <div data-canvas-menu onMouseDown={e => e.stopPropagation()} style={{
            position: 'absolute', left: menu.x, top: menu.y, zIndex: 100,
            background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
            padding: 4, minWidth: 160,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
            <div style={{ padding: '4px 8px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
              Add Node
            </div>
            {PALETTE.map(p => (
              <button key={p.nodeType} onClick={() => addNode(p, menu.flowPos)} style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                padding: '5px 8px', fontSize: 12, borderRadius: 3, background: 'transparent',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <span style={{ color: p.color, fontWeight: 600 }}>{p.label}</span>
                <span style={{ color: '#666', fontSize: 10 }}>{p.desc}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Run log */}
      {runLog.length > 0 && (
        <div style={{
          height: 120, overflow: 'auto', padding: '6px 10px',
          borderTop: '1px solid var(--border)', background: '#0a0a12',
          fontFamily: 'monospace', fontSize: 11, color: '#8b8baa', flexShrink: 0,
        }}>
          {runLog.map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  )
}

export default function CanvasPane({ leafId, filePath }: { leafId?: string; filePath?: string }) {
  if (!filePath) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12, color: 'var(--text-muted)', fontSize: 13,
        fontFamily: 'var(--font-mono)', background: 'var(--bg-surface)',
      }}>
        <span>no .canvas file open</span>
        <span style={{ fontSize: 11, color: 'var(--text-ghost)' }}>
          create a .canvas file in your workspace or right-click in the file tree
        </span>
      </div>
    )
  }

  return (
    <ReactFlowProvider>
      <CanvasInner filePath={filePath} />
    </ReactFlowProvider>
  )
}
