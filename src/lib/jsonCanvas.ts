/**
 * JSON Canvas 1.0 interop — https://jsoncanvas.org/spec/1.0/
 *
 * Export writes a spec-compliant document any JSON Canvas app (Obsidian, etc.)
 * can open; Ghosted-specific node data rides along in a `ghosted` extension
 * field (spec consumers ignore unknown fields) so re-importing is lossless.
 * Import accepts any spec document: nodes with `ghosted` metadata reconstruct
 * exactly; foreign nodes map to the closest Ghosted node type.
 */

import type { Edge, Node } from '@xyflow/react'

export type JsonCanvasSide = 'top' | 'right' | 'bottom' | 'left'

export interface JsonCanvasNodeBase {
  id: string
  type: 'text' | 'file' | 'link' | 'group'
  x: number
  y: number
  width: number
  height: number
  color?: string
  /** Ghosted extension: full node data for lossless round-trips */
  ghosted?: { nodeType: string; data: Record<string, unknown> }
  text?: string
  file?: string
  subpath?: string
  url?: string
  label?: string
  background?: string
  backgroundStyle?: 'cover' | 'ratio' | 'repeat'
}

export interface JsonCanvasEdge {
  id: string
  fromNode: string
  fromSide?: JsonCanvasSide
  fromEnd?: 'none' | 'arrow'
  toNode: string
  toSide?: JsonCanvasSide
  toEnd?: 'none' | 'arrow'
  color?: string
  label?: string
}

export interface JsonCanvasDoc {
  nodes?: JsonCanvasNodeBase[]
  edges?: JsonCanvasEdge[]
}

const TYPE_COLOR: Record<string, string> = {
  prompt: '#8b7cf8',
  skill: '#c084fc',
  context: '#67e8f9',
  terminal: '#4ade80',
  output: '#fbbf24',
  note: '#e8d590',
  group: '#444444',
  run: '#f97316',
}

const DEFAULT_W = 200
const DEFAULT_H = 80

function nodeSize(n: Node): { width: number; height: number } {
  const style = (n.style ?? {}) as { width?: number | string; height?: number | string }
  const width = n.measured?.width ?? (typeof style.width === 'number' ? style.width : undefined)
  const height = n.measured?.height ?? (typeof style.height === 'number' ? style.height : undefined)
  return { width: Math.round(width ?? DEFAULT_W), height: Math.round(height ?? DEFAULT_H) }
}

/** True when a parsed JSON object looks like a spec document rather than
 * Ghosted's internal xyflow save format (which nests position objects). */
export function isJsonCanvasDoc(doc: unknown): doc is JsonCanvasDoc {
  if (!doc || typeof doc !== 'object') return false
  const d = doc as { nodes?: unknown[] }
  if (!Array.isArray(d.nodes)) return false
  if (d.nodes.length === 0) return true
  const first = d.nodes[0] as { x?: unknown; position?: unknown }
  return typeof first.x === 'number' && first.position === undefined
}

export function toJsonCanvas(nodes: Node[], edges: Edge[]): JsonCanvasDoc {
  const outNodes: JsonCanvasNodeBase[] = nodes.map((n) => {
    const data = (n.data ?? {}) as Record<string, unknown>
    const nodeType = String(data.nodeType ?? 'note')
    const label = String(data.label ?? '')
    const { width, height } = nodeSize(n)

    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([k]) => !['onRun', 'status', 'result'].includes(k)),
    )
    const base = {
      id: n.id,
      x: Math.round(n.position.x),
      y: Math.round(n.position.y),
      width,
      height,
      color: TYPE_COLOR[nodeType],
      ghosted: { nodeType, data: cleanData },
    }

    switch (nodeType) {
      case 'group':
        return {
          ...base,
          type: 'group' as const,
          label,
          color: typeof data.groupColor === 'string' ? data.groupColor : base.color,
        }
      case 'note':
        return { ...base, type: 'text' as const, text: String(data.noteText ?? label) }
      case 'skill':
        return data.skillPath
          ? { ...base, type: 'file' as const, file: String(data.skillPath) }
          : { ...base, type: 'text' as const, text: label }
      case 'prompt':
        return { ...base, type: 'text' as const, text: String(data.prompt ?? label) }
      case 'terminal':
        return { ...base, type: 'text' as const, text: data.command ? `$ ${data.command}` : label }
      case 'context':
        return {
          ...base,
          type: 'text' as const,
          text: data.query ? `${label}\n\n\`\`\`json\n${JSON.stringify(data.query, null, 2)}\n\`\`\`` : label,
        }
      default:
        return { ...base, type: 'text' as const, text: label }
    }
  })

  const outEdges: JsonCanvasEdge[] = edges.map((e) => ({
    id: e.id,
    fromNode: e.source,
    toNode: e.target,
    toEnd: 'arrow' as const,
    ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
  }))

  return { nodes: outNodes, edges: outEdges }
}

export interface ImportResult {
  nodes: Node[]
  edges: Edge[]
}

/**
 * Convert a JSON Canvas doc to Ghosted nodes/edges. All ids are remapped via
 * `makeId` so imports can merge into an existing canvas without collisions.
 */
export function fromJsonCanvas(doc: JsonCanvasDoc, makeId: () => string): ImportResult {
  const idMap = new Map<string, string>()
  const nodes: Node[] = []

  for (const jn of doc.nodes ?? []) {
    if (typeof jn.id !== 'string' || typeof jn.x !== 'number' || typeof jn.y !== 'number') continue
    const id = makeId()
    idMap.set(jn.id, id)

    const position = { x: jn.x, y: jn.y }
    const ghosted = jn.ghosted

    if (ghosted?.nodeType && ghosted.data) {
      const nodeType = ghosted.nodeType
      const flowType =
        nodeType === 'note' ? 'note' : nodeType === 'group' ? 'group' : nodeType === 'run' ? 'run' : 'ghosted'
      nodes.push({
        id,
        type: flowType,
        position,
        data: { ...ghosted.data, nodeType, status: 'idle' },
        ...(nodeType === 'group'
          ? {
              style: { width: jn.width, height: jn.height, padding: 0, borderRadius: 8, overflow: 'hidden' },
              zIndex: -1,
            }
          : {}),
      })
      continue
    }

    switch (jn.type) {
      case 'group':
        nodes.push({
          id,
          type: 'group',
          position,
          data: {
            label: jn.label ?? 'Group',
            nodeType: 'group',
            groupColor: jn.color && jn.color.startsWith('#') ? jn.color : '#666',
            status: 'idle',
          },
          style: { width: jn.width, height: jn.height, padding: 0, borderRadius: 8, overflow: 'hidden' },
          zIndex: -1,
        })
        break
      case 'file':
        nodes.push({
          id,
          type: 'note',
          position,
          data: {
            label: jn.file ?? 'file',
            nodeType: 'note',
            noteText: jn.subpath ? `${jn.file}${jn.subpath}` : (jn.file ?? ''),
            status: 'idle',
          },
        })
        break
      case 'link':
        nodes.push({
          id,
          type: 'note',
          position,
          data: { label: jn.url ?? 'link', nodeType: 'note', noteText: jn.url ?? '', status: 'idle' },
        })
        break
      default:
        nodes.push({
          id,
          type: 'note',
          position,
          data: {
            label: (jn.text ?? '').split('\n')[0].slice(0, 60) || 'note',
            nodeType: 'note',
            noteText: jn.text ?? '',
            status: 'idle',
          },
        })
    }
  }

  const edges: Edge[] = []
  for (const je of doc.edges ?? []) {
    const source = idMap.get(je.fromNode)
    const target = idMap.get(je.toNode)
    if (!source || !target) continue
    edges.push({
      id: makeId(),
      source,
      target,
      ...(je.label ? { label: je.label } : {}),
    })
  }

  return { nodes, edges }
}
