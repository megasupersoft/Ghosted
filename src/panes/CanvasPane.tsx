import React, { useCallback, useState, useRef, useEffect, memo } from 'react'
import {
  ReactFlow, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, Connection, MarkerType,
  useReactFlow, ReactFlowProvider, Handle, Position,
  type Node, type Edge, type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGhostDB } from '@/lib/useGhostDB'
import { useStore } from '@/store'
import type { GhostedQuery } from '@/types/electron'

// ─── Node types ──────────────────────────────────────────────────────────────

export type NodeStatus = 'idle' | 'running' | 'done' | 'error'

export interface GhostedNodeData extends Record<string, unknown> {
  label: string
  nodeType: 'prompt' | 'skill' | 'context' | 'terminal' | 'output'
  // prompt node
  prompt?: string
  // skill node
  skillPath?: string
  // context node — queries GhostedDB
  query?: GhostedQuery
  injectFields?: string[]   // frontmatter fields to include, default: all
  // terminal node
  command?: string
  // runtime status
  status?: NodeStatus
  result?: string
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
      <Handle type="target" position={Position.Left}
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

      <Handle type="source" position={Position.Right}
        style={{ background: '#555', border: '1.5px solid #888', width: 8, height: 8 }} />
    </div>
  )
})

const nodeTypes = { ghosted: GhostedNode }

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
        // Strip SKILL.md frontmatter
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
      // Terminal nodes are handled by the execution engine, not here
      return previousOutput

    case 'output':
      return previousOutput

    default:
      return previousOutput
  }
}

// Topological sort of nodes following edges
function topoSort(nodes: Node[], edges: Edge[]): Node[] {
  const adj = new Map<string, string[]>()
  const inDeg = new Map<string, number>()
  for (const n of nodes) { adj.set(n.id, []); inDeg.set(n.id, 0) }
  for (const e of edges) {
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

// ─── Default workflow (New Feature) ──────────────────────────────────────────

const mkNode = (id: string, label: string, nodeType: GhostedNodeData['nodeType'],
  extra: Partial<GhostedNodeData>, pos: {x:number;y:number}): Node => ({
  id, type: 'ghosted', position: pos,
  data: { label, nodeType, status: 'idle' as NodeStatus, ...extra },
})

const INITIAL_NODES: Node[] = [
  mkNode('ctx',  'Workspace Context', 'context',  { query: { ext: '.md', where: [{ field: 'status', op: 'exists' }], orderBy: 'mtime', orderDir: 'desc', limit: 10 } }, { x: 0,   y: 60 }),
  mkNode('brief','Brief',             'skill',    { skillPath: '.claude/skills/brief/SKILL.md'  }, { x: 280, y: 60 }),
  mkNode('arch', 'Arch',              'skill',    { skillPath: '.claude/skills/arch/SKILL.md'   }, { x: 560, y: 60 }),
  mkNode('impl', 'Implement',         'prompt',   { prompt: 'Implement the feature. TypeScript, follow CLAUDE.md conventions. No any without comment.' }, { x: 840, y: 60 }),
  mkNode('rev',  'Review',            'skill',    { skillPath: '.claude/skills/review/SKILL.md' }, { x: 1120, y: 60 }),
  mkNode('ship', 'Ship',              'skill',    { skillPath: '.claude/skills/ship/SKILL.md'   }, { x: 1400, y: 60 }),
]

const mkEdge = (s: string, t: string): Edge => ({
  id: `e-${s}-${t}`, source: s, target: t, animated: true,
  style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
})

const INITIAL_EDGES: Edge[] = [
  mkEdge('ctx','brief'), mkEdge('brief','arch'), mkEdge('arch','impl'),
  mkEdge('impl','rev'), mkEdge('rev','ship'),
]

let idCounter = 20

// ─── Node palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  { nodeType: 'prompt'   as const, label: 'Prompt',   color: '#8b7cf8', desc: 'Text prompt for Claude' },
  { nodeType: 'skill'    as const, label: 'Skill',    color: '#c084fc', desc: 'Load a SKILL.md file'   },
  { nodeType: 'context'  as const, label: 'Context',  color: '#67e8f9', desc: 'Query workspace files'  },
  { nodeType: 'terminal' as const, label: 'Terminal', color: '#4ade80', desc: 'Run a shell command'    },
  { nodeType: 'output'   as const, label: 'Output',   color: '#fbbf24', desc: 'Capture final result'   },
]

// ─── Main canvas ─────────────────────────────────────────────────────────────

function CanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)
  const [menu, setMenu] = useState<{ x: number; y: number; flowPos: { x: number; y: number } } | null>(null)
  const [running, setRunning] = useState(false)
  const [runLog, setRunLog] = useState<string[]>([])
  const wrapperRef = useRef<HTMLDivElement>(null)
  const flow = useReactFlow()
  const { query } = useGhostDB()
  const { workspacePath } = useStore()

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

  // ── Run workflow ────────────────────────────────────────────────────────────
  const runWorkflow = useCallback(async () => {
    if (running || !workspacePath) return
    setRunning(true)
    setRunLog([])

    // Reset all node statuses
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, status: 'idle', result: undefined } })))

    const sorted = topoSort(nodes, edges)
    const log = (msg: string) => setRunLog(l => [...l, msg])

    let context = ''

    for (const node of sorted) {
      const d = node.data as GhostedNodeData
      setNodeStatus(node.id, 'running')
      log(`▶ ${d.label}`)

      try {
        if (d.nodeType === 'terminal' && d.command) {
          // Run shell command via PTY and capture output
          const id = `canvas-${Date.now()}`
          await window.electron.pty.create(id, workspacePath)
          let output = ''
          await new Promise<void>((resolve) => {
            window.electron.pty.onData(id, (data) => { output += data })
            window.electron.pty.onExit(id, () => resolve())
            window.electron.pty.write(id, `${d.command}\n`)
            // Timeout safety
            setTimeout(() => resolve(), 10000)
          })
          await window.electron.pty.kill(id)
          window.electron.pty.removeListeners(id)
          context = [context, `## Terminal output\n\`\`\`\n${output.trim()}\n\`\`\``].filter(Boolean).join('\n\n')
          setNodeStatus(node.id, 'done', output.trim().slice(0, 200))
        } else {
          // Resolve node content
          const resolved = await resolveNode(node, context, query, window.electron.fs.readfile)
          context = resolved
          setNodeStatus(node.id, 'done', resolved.slice(-200))
        }
        log(`  ✓ ${d.label} done`)
      } catch (err) {
        setNodeStatus(node.id, 'error')
        log(`  ✗ ${d.label} error: ${err}`)
        break
      }
    }

    // Final: pipe to pi or copy to clipboard
    log('\n─── Final prompt ready ───')
    log(`${context.length} chars | ${context.split('\n').length} lines`)

    // Pipe to pi via terminal if available
    const termId = `canvas-pi-${Date.now()}`
    try {
      await window.electron.pty.create(termId, workspacePath)
      // Write prompt to a temp file then pipe to pi
      const tmpPath = `${workspacePath}/.ghosted-workflow-prompt.md`
      await window.electron.fs.writefile(tmpPath, context)
      window.electron.pty.write(termId, `pi --print "$(cat .ghosted-workflow-prompt.md)"\n`)
      log('▶ Piped to pi — check terminal pane')
    } catch {
      // pi not available — copy to clipboard
      await navigator.clipboard.writeText(context).catch(() => {})
      log('📋 Copied to clipboard (pi not found)')
    }

    setRunning(false)
  }, [nodes, edges, running, workspacePath, query, setNodes, setNodeStatus])

  // Context menu
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

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [menu])

  const addNode = (p: typeof PALETTE[0], pos: { x: number; y: number }) => {
    setNodes(ns => [...ns, {
      id: String(++idCounter), type: 'ghosted', position: pos,
      data: { label: p.label, nodeType: p.nodeType, status: 'idle' as NodeStatus },
    }])
    setMenu(null)
  }

  return (
    <div ref={wrapperRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1 }}>
          WORKFLOW CANVAS
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={runWorkflow}
          disabled={running}
          style={{
            padding: '4px 14px', borderRadius: 4, fontSize: 12, fontWeight: 600,
            background: running ? '#fbbf2422' : '#4ade8022',
            color: running ? '#fbbf24' : '#4ade80',
            border: `1px solid ${running ? '#fbbf24' : '#4ade80'}44`,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          {running ? '⟳ Running…' : '▶ Run workflow'}
        </button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} fitView
          nodeTypes={nodeTypes}
          style={{ background: '#0e0e16' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1a1a2e" variant={BackgroundVariant.Dots} gap={24} size={1} />
        </ReactFlow>

        {/* Context menu */}
        {menu && (
          <div onMouseDown={e => e.stopPropagation()} style={{
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

export default function CanvasPane() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  )
}
