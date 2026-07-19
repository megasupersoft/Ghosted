import { describe, expect, it } from 'vitest'
import { filterGraph, matchNodes, neighborhood } from './graphFilter'

// a—b—c—d chain, plus isolated e, plus f—g pair
const nodes = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, label: `${id}-note` }))
const links = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
  { source: 'f', target: 'g' },
]

describe('matchNodes', () => {
  it('matches case-insensitive substrings', () => {
    expect(matchNodes(nodes, 'A-NO')).toEqual(new Set(['a']))
    expect(matchNodes(nodes, 'note')).toEqual(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g']))
  })

  it('empty or whitespace query matches nothing', () => {
    expect(matchNodes(nodes, '')).toEqual(new Set())
    expect(matchNodes(nodes, '   ')).toEqual(new Set())
  })
})

describe('neighborhood', () => {
  it('depth 1 keeps direct neighbors only', () => {
    expect(neighborhood(links, 'b', 1)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('depth 2 extends two hops', () => {
    expect(neighborhood(links, 'a', 2)).toEqual(new Set(['a', 'b', 'c']))
    expect(neighborhood(links, 'b', 2)).toEqual(new Set(['a', 'b', 'c', 'd']))
  })

  it('all floods the connected component but not others', () => {
    expect(neighborhood(links, 'a', 'all')).toEqual(new Set(['a', 'b', 'c', 'd']))
    expect(neighborhood(links, 'f', 'all')).toEqual(new Set(['f', 'g']))
  })

  it('isolated root stays alone', () => {
    expect(neighborhood(links, 'e', 3)).toEqual(new Set(['e']))
  })
})

describe('filterGraph', () => {
  it('returns the full graph without a root', () => {
    const res = filterGraph(nodes, links, null, 1)
    expect(res.nodes).toHaveLength(7)
    expect(res.links).toHaveLength(4)
  })

  it('trims nodes and links outside the neighborhood', () => {
    const res = filterGraph(nodes, links, 'b', 1)
    expect(res.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c'])
    expect(res.links).toHaveLength(2)
  })

  it('ignores a root that no longer exists', () => {
    const res = filterGraph(nodes, links, 'zombie', 2)
    expect(res.nodes).toHaveLength(7)
  })
})
