/**
 * Pure graph filtering for the knowledge-graph pane: substring search over
 * node labels, and breadth-first neighborhood extraction for depth-limited
 * local views (Obsidian-style "local graph").
 */

export interface GraphNode {
  id: string
  label: string
}

export interface GraphLink {
  source: string
  target: string
}

export type GraphDepth = 1 | 2 | 3 | 'all'

/** Case-insensitive substring match over node labels. */
export function matchNodes(nodes: GraphNode[], query: string): Set<string> {
  const q = query.trim().toLowerCase()
  if (!q) return new Set()
  return new Set(nodes.filter((n) => n.label.toLowerCase().includes(q)).map((n) => n.id))
}

/** Node ids within `depth` undirected hops of `rootId` (root included). */
export function neighborhood(links: GraphLink[], rootId: string, depth: GraphDepth): Set<string> {
  const result = new Set<string>([rootId])
  if (depth === 'all') {
    // Flood fill the connected component
    let grew = true
    while (grew) {
      grew = false
      for (const l of links) {
        if (result.has(l.source) !== result.has(l.target)) {
          result.add(l.source)
          result.add(l.target)
          grew = true
        }
      }
    }
    return result
  }

  const adjacency = new Map<string, string[]>()
  for (const l of links) {
    if (!adjacency.has(l.source)) adjacency.set(l.source, [])
    if (!adjacency.has(l.target)) adjacency.set(l.target, [])
    adjacency.get(l.source)?.push(l.target)
    adjacency.get(l.target)?.push(l.source)
  }

  let frontier = [rootId]
  for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
    const next: string[] = []
    for (const id of frontier) {
      for (const neighbor of adjacency.get(id) ?? []) {
        if (!result.has(neighbor)) {
          result.add(neighbor)
          next.push(neighbor)
        }
      }
    }
    frontier = next
  }
  return result
}

export interface FilteredGraph<N extends GraphNode, L extends GraphLink> {
  nodes: N[]
  links: L[]
}

/** Restrict a graph to the depth-neighborhood of `rootId` (no-op without a root). */
export function filterGraph<N extends GraphNode, L extends GraphLink>(
  nodes: N[],
  links: L[],
  rootId: string | null,
  depth: GraphDepth,
): FilteredGraph<N, L> {
  if (!rootId || !nodes.some((n) => n.id === rootId)) return { nodes, links }
  const keep = neighborhood(links, rootId, depth)
  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    links: links.filter((l) => keep.has(l.source) && keep.has(l.target)),
  }
}
