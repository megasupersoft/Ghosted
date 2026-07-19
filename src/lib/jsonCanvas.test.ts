import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { fromJsonCanvas, isJsonCanvasDoc, type JsonCanvasDoc, toJsonCanvas } from './jsonCanvas'

const ghostedNodes: Node[] = [
  {
    id: '1',
    type: 'ghosted',
    position: { x: 10.4, y: 20.6 },
    measured: { width: 180, height: 90 },
    data: {
      label: 'Ask Claude',
      nodeType: 'prompt',
      prompt: 'Summarize the workspace',
      status: 'done',
      result: 'stale runtime output',
      onRun: () => {},
    },
  },
  {
    id: '2',
    type: 'note',
    position: { x: 300, y: 40 },
    data: { label: 'Note', nodeType: 'note', noteText: 'remember this' },
  },
  {
    id: '3',
    type: 'group',
    position: { x: 0, y: 200 },
    style: { width: 340, height: 400 },
    data: { label: 'Pipeline', nodeType: 'group', groupColor: '#663399' },
  },
]

const ghostedEdges: Edge[] = [{ id: 'e1', source: '1', target: '2', label: 'then' }]

describe('toJsonCanvas', () => {
  it('produces spec-shaped nodes with integer geometry', () => {
    const doc = toJsonCanvas(ghostedNodes, ghostedEdges)
    expect(doc.nodes).toHaveLength(3)
    const prompt = doc.nodes?.find((n) => n.id === '1')
    expect(prompt).toMatchObject({ type: 'text', x: 10, y: 21, width: 180, height: 90 })
    expect(prompt?.text).toBe('Summarize the workspace')
  })

  it('maps groups to group nodes with their color and size', () => {
    const doc = toJsonCanvas(ghostedNodes, ghostedEdges)
    const group = doc.nodes?.find((n) => n.id === '3')
    expect(group).toMatchObject({
      type: 'group',
      label: 'Pipeline',
      color: '#663399',
      width: 340,
      height: 400,
    })
  })

  it('maps edges to fromNode/toNode with labels', () => {
    const doc = toJsonCanvas(ghostedNodes, ghostedEdges)
    expect(doc.edges?.[0]).toMatchObject({ fromNode: '1', toNode: '2', toEnd: 'arrow', label: 'then' })
  })

  it('strips runtime-only data from the ghosted extension field', () => {
    const doc = toJsonCanvas(ghostedNodes, ghostedEdges)
    const g = doc.nodes?.find((n) => n.id === '1')?.ghosted
    expect(g?.nodeType).toBe('prompt')
    expect(g?.data).not.toHaveProperty('onRun')
    expect(g?.data).not.toHaveProperty('status')
    expect(g?.data).not.toHaveProperty('result')
  })
})

describe('round-trip', () => {
  it('ghosted → jsoncanvas → ghosted preserves node types and data', () => {
    const doc = toJsonCanvas(ghostedNodes, ghostedEdges)
    let n = 100
    const back = fromJsonCanvas(doc, () => String(++n))
    expect(back.nodes).toHaveLength(3)

    const prompt = back.nodes.find((x) => (x.data as any).nodeType === 'prompt')
    expect(prompt?.type).toBe('ghosted')
    expect((prompt?.data as any).prompt).toBe('Summarize the workspace')
    expect((prompt?.data as any).status).toBe('idle')

    const group = back.nodes.find((x) => (x.data as any).nodeType === 'group')
    expect(group?.type).toBe('group')
    expect((group?.style as any).width).toBe(340)

    expect(back.edges).toHaveLength(1)
    expect(back.edges[0].source).toBe(prompt?.id)
  })
})

describe('fromJsonCanvas with foreign (Obsidian-style) docs', () => {
  const obsidian: JsonCanvasDoc = {
    nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 250, height: 60, text: '# Heading\nBody' },
      { id: 'b', type: 'file', x: 300, y: 0, width: 400, height: 400, file: 'notes/idea.md', subpath: '#h1' },
      { id: 'c', type: 'link', x: 0, y: 200, width: 300, height: 200, url: 'https://example.com' },
      { id: 'd', type: 'group', x: -50, y: -50, width: 800, height: 600, label: 'All', color: '4' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  }

  it('maps text/file/link/group to Ghosted equivalents with remapped ids', () => {
    let n = 0
    const res = fromJsonCanvas(obsidian, () => `imp-${++n}`)
    expect(res.nodes.map((x) => x.id)).toEqual(['imp-1', 'imp-2', 'imp-3', 'imp-4'])

    expect(res.nodes[0].data as any).toMatchObject({ nodeType: 'note', noteText: '# Heading\nBody' })
    expect((res.nodes[1].data as any).noteText).toBe('notes/idea.md#h1')
    expect((res.nodes[2].data as any).noteText).toBe('https://example.com')
    expect(res.nodes[3].type).toBe('group')
    // preset color "4" is not hex — falls back rather than leaking spec presets
    expect((res.nodes[3].data as any).groupColor).toBe('#666')

    expect(res.edges[0]).toMatchObject({ source: 'imp-1', target: 'imp-2' })
  })

  it('drops edges pointing at unknown nodes', () => {
    let n = 0
    const res = fromJsonCanvas(
      { nodes: obsidian.nodes, edges: [{ id: 'x', fromNode: 'a', toNode: 'ghost' }] },
      () => `i${++n}`,
    )
    expect(res.edges).toHaveLength(0)
  })
})

describe('isJsonCanvasDoc', () => {
  it('accepts spec docs and rejects Ghosted internal saves', () => {
    expect(isJsonCanvasDoc({ nodes: [{ id: 'a', type: 'text', x: 1, y: 2, width: 3, height: 4 }] })).toBe(
      true,
    )
    expect(isJsonCanvasDoc({ nodes: [], edges: [] })).toBe(true)
    expect(isJsonCanvasDoc({ nodes: [{ id: '1', position: { x: 1, y: 2 }, data: {} }], idCounter: 5 })).toBe(
      false,
    )
    expect(isJsonCanvasDoc(null)).toBe(false)
    expect(isJsonCanvasDoc({ foo: 1 })).toBe(false)
  })
})
