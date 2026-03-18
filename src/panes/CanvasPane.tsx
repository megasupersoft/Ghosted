import React, { useCallback, useState } from 'react'
import {
  ReactFlow, MiniMap, Controls, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, Connection, Panel, MarkerType,
  type Node, type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

const NODE_TYPES = [
  { type: 'llm',    label: 'LLM',    color: '#8b7cf8', desc: 'Language model call' },
  { type: 'tool',   label: 'Tool',   color: '#4ade80', desc: 'Tool / function call' },
  { type: 'input',  label: 'Input',  color: '#c084fc', desc: 'User / system input'  },
  { type: 'output', label: 'Output', color: '#fbbf24', desc: 'Final output'          },
  { type: 'router', label: 'Router', color: '#f87171', desc: 'Conditional branch'    },
  { type: 'memory', label: 'Memory', color: '#67e8f9', desc: 'Memory read/write'     },
]

const mkStyle = (color: string) => ({
  background: color + '12', border: `1.5px solid ${color}`,
  borderRadius: 8, color: '#e2e2f0', fontSize: 12,
  padding: '8px 14px', minWidth: 120,
})

const INITIAL_NODES: Node[] = [
  { id: '1', type: 'default', position: { x: 80,  y: 160 }, data: { label: 'User Input'    }, style: mkStyle('#c084fc') },
  { id: '2', type: 'default', position: { x: 300, y: 160 }, data: { label: 'Planner LLM'   }, style: mkStyle('#8b7cf8') },
  { id: '3', type: 'default', position: { x: 520, y: 70  }, data: { label: 'Web Search'    }, style: mkStyle('#4ade80') },
  { id: '4', type: 'default', position: { x: 520, y: 250 }, data: { label: 'Memory Read'   }, style: mkStyle('#67e8f9') },
  { id: '5', type: 'default', position: { x: 740, y: 160 }, data: { label: 'Responder LLM' }, style: mkStyle('#8b7cf8') },
  { id: '6', type: 'default', position: { x: 960, y: 160 }, data: { label: 'Final Output'  }, style: mkStyle('#fbbf24') },
]

const mkEdge = (id: string, source: string, target: string, color: string, animated = false): Edge => ({
  id, source, target, animated,
  style: { stroke: color, strokeWidth: 1.5 },
  markerEnd: { type: MarkerType.ArrowClosed, color },
})

const INITIAL_EDGES: Edge[] = [
  mkEdge('e1-2', '1', '2', '#8b7cf8', true),
  mkEdge('e2-3', '2', '3', '#4ade80', true),
  mkEdge('e2-4', '2', '4', '#67e8f9', true),
  mkEdge('e3-5', '3', '5', '#8b7cf8'),
  mkEdge('e4-5', '4', '5', '#8b7cf8'),
  mkEdge('e5-6', '5', '6', '#fbbf24', true),
]

let idCounter = 10

export default function CanvasPane() {
  const [nodes, setNodes, onNodesChange] = useNodesState(INITIAL_NODES)
  const [edges, setEdges, onEdgesChange] = useEdgesState(INITIAL_EDGES)

  const onConnect = useCallback((c: Connection) =>
    setEdges(eds => addEdge({
      ...c, animated: true,
      style: { stroke: '#8b7cf8', strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#8b7cf8' },
    }, eds)), [setEdges])

  const addNode = (nt: typeof NODE_TYPES[0]) =>
    setNodes(ns => [...ns, {
      id: String(++idCounter), type: 'default',
      position: { x: 150 + Math.random() * 400, y: 150 + Math.random() * 250 },
      data: { label: nt.label }, style: mkStyle(nt.color),
    }])

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '0 12px', height: 36, display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Agent canvas</span>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onConnect={onConnect} fitView
          style={{ background: '#07070d' }}
        >
          <Background color="#1a1a2e" variant={BackgroundVariant.Dots} gap={24} size={1} />
          <MiniMap style={{ background: '#0e0e16' }} nodeColor={n => (n.style?.borderColor as string) ?? '#333'} />
          <Controls />
          <Panel position="top-left">
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 8, display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 320 }}>
              {NODE_TYPES.map(nt => (
                <button key={nt.type} onClick={() => addNode(nt)} title={nt.desc} style={{
                  padding: '3px 9px', borderRadius: 4, fontSize: 11,
                  background: nt.color + '18', border: `1px solid ${nt.color}50`,
                  color: nt.color, cursor: 'pointer',
                }}>
                  + {nt.label}
                </button>
              ))}
            </div>
          </Panel>
        </ReactFlow>
      </div>
    </div>
  )
}
