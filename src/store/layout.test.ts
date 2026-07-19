import { describe, expect, it } from 'vitest'
import {
  addTabToLeaf,
  changeLeafPane,
  closeLeaf,
  countLeaves,
  DEFAULT_LAYOUT,
  findFirstLeafByPane,
  findLeaf,
  findLeafByTabId,
  findTabByFilePath,
  getActiveTab,
  getAllTabs,
  getSiblingLeafId,
  type LayoutNode,
  type LeafNode,
  migrateLayout,
  mkLeaf,
  mkTab,
  removeTabFromLeaf,
  reorderTabInLeaf,
  setActiveTabInLeaf,
  splitLeaf,
  splitLeafAtPosition,
  splitLeafWithTab,
  type SplitNode,
  updateSplitSizes,
  updateTab,
} from './layout'

const editor = () => mkLeaf('leaf-1', 'editor')

function splitTree(): SplitNode {
  return splitLeaf(editor(), 'leaf-1', 'horizontal', 'leaf-2', 'split-1') as SplitNode
}

describe('mkLeaf / mkTab', () => {
  it('creates a leaf with one tab whose id matches the leaf', () => {
    const leaf = mkLeaf('a', 'terminal', 'Terminal')
    expect(leaf.tabs).toHaveLength(1)
    expect(leaf.activeTabId).toBe('a')
    expect(leaf.tabs[0]).toEqual(mkTab('a', 'terminal', 'Terminal'))
  })
})

describe('splitLeaf', () => {
  it('replaces the target leaf with a split containing old and new leaves', () => {
    const tree = splitTree()
    expect(tree.type).toBe('split')
    expect(tree.direction).toBe('horizontal')
    expect(tree.sizes).toEqual([50, 50])
    expect((tree.children[0] as LeafNode).id).toBe('leaf-1')
    expect((tree.children[1] as LeafNode).id).toBe('leaf-2')
  })

  it('new leaf inherits the active tab pane type', () => {
    const tree = splitTree()
    expect(getActiveTab(tree.children[1] as LeafNode).paneType).toBe('editor')
  })

  it('leaves unrelated leaves untouched', () => {
    const tree = splitTree()
    const deeper = splitLeaf(tree, 'leaf-2', 'vertical', 'leaf-3', 'split-2') as SplitNode
    expect((deeper.children[0] as LeafNode).id).toBe('leaf-1')
    expect(countLeaves(deeper)).toBe(3)
  })
})

describe('closeLeaf', () => {
  it('collapses a split to the surviving sibling', () => {
    const tree = splitTree()
    const closed = closeLeaf(tree, 'leaf-2')
    expect(closed.type).toBe('leaf')
    expect((closed as LeafNode).id).toBe('leaf-1')
  })

  it('collapses nested splits correctly', () => {
    const tree = splitLeaf(splitTree(), 'leaf-2', 'vertical', 'leaf-3', 'split-2') as SplitNode
    const closed = closeLeaf(tree, 'leaf-3') as SplitNode
    expect(closed.type).toBe('split')
    expect(countLeaves(closed)).toBe(2)
    expect(findLeaf(closed, 'leaf-3')).toBeNull()
  })

  it('is a no-op for unknown leaf ids', () => {
    const tree = splitTree()
    expect(closeLeaf(tree, 'nope')).toBe(tree)
  })
})

describe('tabs', () => {
  it('addTabToLeaf appends and activates the new tab', () => {
    const tree = addTabToLeaf(editor(), 'leaf-1', mkTab('t2', 'terminal')) as LeafNode
    expect(tree.tabs).toHaveLength(2)
    expect(tree.activeTabId).toBe('t2')
  })

  it('removeTabFromLeaf activates the previous tab when removing the active one', () => {
    let tree: LayoutNode = editor()
    tree = addTabToLeaf(tree, 'leaf-1', mkTab('t2', 'terminal'))
    tree = addTabToLeaf(tree, 'leaf-1', mkTab('t3', 'graph'))
    const after = removeTabFromLeaf(tree, 'leaf-1', 't3') as LeafNode
    expect(after.tabs.map((t) => t.id)).toEqual(['leaf-1', 't2'])
    expect(after.activeTabId).toBe('t2')
  })

  it('removeTabFromLeaf keeps the active tab when removing an inactive one', () => {
    let tree: LayoutNode = editor()
    tree = addTabToLeaf(tree, 'leaf-1', mkTab('t2', 'terminal'))
    const after = removeTabFromLeaf(tree, 'leaf-1', 'leaf-1') as LeafNode
    expect(after.activeTabId).toBe('t2')
  })

  it('removeTabFromLeaf refuses to empty a leaf', () => {
    const tree = editor()
    expect(removeTabFromLeaf(tree, 'leaf-1', 'leaf-1')).toBe(tree)
  })

  it('setActiveTabInLeaf switches the active tab', () => {
    let tree: LayoutNode = addTabToLeaf(editor(), 'leaf-1', mkTab('t2', 'terminal'))
    tree = setActiveTabInLeaf(tree, 'leaf-1', 'leaf-1')
    expect((tree as LeafNode).activeTabId).toBe('leaf-1')
  })

  it('reorderTabInLeaf moves a tab to the target index', () => {
    let tree: LayoutNode = editor()
    tree = addTabToLeaf(tree, 'leaf-1', mkTab('t2', 'terminal'))
    tree = addTabToLeaf(tree, 'leaf-1', mkTab('t3', 'graph'))
    const after = reorderTabInLeaf(tree, 'leaf-1', 't3', 0) as LeafNode
    expect(after.tabs.map((t) => t.id)).toEqual(['t3', 'leaf-1', 't2'])
  })

  it('updateTab patches tab properties anywhere in the tree', () => {
    const tree = splitTree()
    const after = updateTab(tree, 'leaf-2', { label: 'Renamed', filePath: '/x.md' }) as SplitNode
    const leaf2 = findLeaf(after, 'leaf-2') as LeafNode
    expect(leaf2.tabs[0].label).toBe('Renamed')
    expect(findTabByFilePath(after, '/x.md')?.leaf.id).toBe('leaf-2')
  })
})

describe('lookups', () => {
  it('findLeafByTabId finds the owning leaf', () => {
    const tree = addTabToLeaf(splitTree(), 'leaf-2', mkTab('t9', 'kanban'))
    expect(findLeafByTabId(tree, 't9')?.id).toBe('leaf-2')
    expect(findLeafByTabId(tree, 'missing')).toBeNull()
  })

  it('findFirstLeafByPane does a depth-first search', () => {
    const tree = changeLeafPane(splitTree(), 'leaf-2', 'graph')
    expect(findFirstLeafByPane(tree, 'graph')?.id).toBe('leaf-2')
    expect(findFirstLeafByPane(tree, 'kanban')).toBeNull()
  })

  it('getSiblingLeafId returns the neighbor leaf', () => {
    const tree = splitTree()
    expect(getSiblingLeafId(tree, 'leaf-1')).toBe('leaf-2')
    expect(getSiblingLeafId(tree, 'leaf-2')).toBe('leaf-1')
  })

  it('getAllTabs collects tabs from every leaf', () => {
    const tree = addTabToLeaf(splitTree(), 'leaf-1', mkTab('t2', 'terminal'))
    expect(getAllTabs(tree).map((t) => t.id)).toEqual(['leaf-1', 't2', 'leaf-2'])
  })
})

describe('splits', () => {
  it('updateSplitSizes only touches the target split', () => {
    const tree = splitLeaf(splitTree(), 'leaf-2', 'vertical', 'leaf-3', 'split-2') as SplitNode
    const after = updateSplitSizes(tree, 'split-2', [30, 70]) as SplitNode
    expect(after.sizes).toEqual([50, 50])
    expect((after.children[1] as SplitNode).sizes).toEqual([30, 70])
  })

  it('splitLeafAtPosition can insert the new leaf before the target', () => {
    const tree = splitLeafAtPosition(
      editor(),
      'leaf-1',
      'vertical',
      'leaf-new',
      'split-new',
      'terminal',
      true,
    ) as SplitNode
    expect((tree.children[0] as LeafNode).id).toBe('leaf-new')
    expect(getActiveTab(tree.children[0] as LeafNode).paneType).toBe('terminal')
  })

  it('splitLeafWithTab preserves the moved tab identity', () => {
    const tab = mkTab('moved-tab', 'canvas', 'My Canvas', '/w.canvas')
    const tree = splitLeafWithTab(editor(), 'leaf-1', 'horizontal', 'leaf-n', 'split-n', tab, false) as SplitNode
    const newLeaf = tree.children[1] as LeafNode
    expect(newLeaf.tabs).toEqual([tab])
    expect(newLeaf.activeTabId).toBe('moved-tab')
  })
})

describe('migrateLayout', () => {
  it('converts the old single-pane format into tabs', () => {
    const old = {
      type: 'split',
      id: 's',
      direction: 'horizontal',
      sizes: [50, 50],
      children: [
        { type: 'leaf', id: 'a', paneType: 'editor' },
        { type: 'leaf', id: 'b', paneType: 'terminal' },
      ],
    }
    const migrated = migrateLayout(old) as SplitNode
    const a = migrated.children[0] as LeafNode
    expect(a.tabs).toEqual([{ id: 'a', paneType: 'editor' }])
    expect(a.activeTabId).toBe('a')
  })

  it('passes through the current format untouched', () => {
    expect(migrateLayout(DEFAULT_LAYOUT)).toBe(DEFAULT_LAYOUT)
  })
})
