// Layout tree types and pure transform functions

export type PaneId = 'editor' | 'terminal' | 'graph' | 'canvas' | 'kanban' | 'ai'

export interface TabEntry {
  id: string       // unique tab ID, used as leafId for pane components
  paneType: PaneId
  label?: string   // display name (file name or tool name)
  filePath?: string // for file-based tabs
  pinned?: boolean
}

export interface LeafNode {
  type: 'leaf'
  id: string
  tabs: TabEntry[]
  activeTabId: string
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: [LayoutNode, LayoutNode]
  sizes: [number, number]
}

export type LayoutNode = LeafNode | SplitNode

export function mkTab(id: string, paneType: PaneId, label?: string, filePath?: string): TabEntry {
  return { id, paneType, label, filePath }
}

export function mkLeaf(id: string, paneType: PaneId, label?: string, filePath?: string): LeafNode {
  return { type: 'leaf', id, tabs: [mkTab(id, paneType, label, filePath)], activeTabId: id }
}

// Find a tab by file path in any leaf
export function findTabByFilePath(tree: LayoutNode, filePath: string): { leaf: LeafNode; tab: TabEntry } | null {
  if (tree.type === 'leaf') {
    const tab = tree.tabs.find(t => t.filePath === filePath)
    return tab ? { leaf: tree, tab } : null
  }
  return findTabByFilePath(tree.children[0], filePath) ?? findTabByFilePath(tree.children[1], filePath)
}

// Update a tab's properties
export function updateTab(tree: LayoutNode, tabId: string, updates: Partial<TabEntry>): LayoutNode {
  if (tree.type === 'leaf') {
    const idx = tree.tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return tree
    const tabs = [...tree.tabs]
    tabs[idx] = { ...tabs[idx], ...updates }
    return { ...tree, tabs }
  }
  return {
    ...tree,
    children: [
      updateTab(tree.children[0], tabId, updates),
      updateTab(tree.children[1], tabId, updates),
    ],
  }
}

export const DEFAULT_LAYOUT: LayoutNode = mkLeaf('leaf-1', 'editor')

export function getActiveTab(leaf: LeafNode): TabEntry {
  return leaf.tabs.find(t => t.id === leaf.activeTabId) ?? leaf.tabs[0]
}

// Migrate old format (single paneType) to new format (tabs array)
export function migrateLayout(node: any): LayoutNode {
  if (node.type === 'leaf') {
    if (node.tabs) return node
    return {
      type: 'leaf',
      id: node.id,
      tabs: [{ id: node.id, paneType: node.paneType }],
      activeTabId: node.id,
    }
  }
  return {
    ...node,
    children: [migrateLayout(node.children[0]), migrateLayout(node.children[1])],
  }
}

export function findLeaf(tree: LayoutNode, leafId: string): LeafNode | null {
  if (tree.type === 'leaf') return tree.id === leafId ? tree : null
  return findLeaf(tree.children[0], leafId) ?? findLeaf(tree.children[1], leafId)
}

// Find a leaf that contains a specific tab ID
export function findLeafByTabId(tree: LayoutNode, tabId: string): LeafNode | null {
  if (tree.type === 'leaf') return tree.tabs.some(t => t.id === tabId) ? tree : null
  return findLeafByTabId(tree.children[0], tabId) ?? findLeafByTabId(tree.children[1], tabId)
}

export function countLeaves(tree: LayoutNode): number {
  if (tree.type === 'leaf') return 1
  return countLeaves(tree.children[0]) + countLeaves(tree.children[1])
}

export function findFirstLeafByPane(tree: LayoutNode, paneType: PaneId): LeafNode | null {
  if (tree.type === 'leaf') return tree.tabs.some(t => t.paneType === paneType) ? tree : null
  return findFirstLeafByPane(tree.children[0], paneType) ?? findFirstLeafByPane(tree.children[1], paneType)
}

export function splitLeaf(
  tree: LayoutNode,
  leafId: string,
  direction: 'horizontal' | 'vertical',
  newLeafId: string,
  newSplitId: string,
): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    const activeTab = getActiveTab(tree)
    return {
      type: 'split',
      id: newSplitId,
      direction,
      children: [
        { ...tree },
        mkLeaf(newLeafId, activeTab.paneType),
      ],
      sizes: [50, 50],
    }
  }
  return {
    ...tree,
    children: [
      splitLeaf(tree.children[0], leafId, direction, newLeafId, newSplitId),
      splitLeaf(tree.children[1], leafId, direction, newLeafId, newSplitId),
    ],
  }
}

export function closeLeaf(tree: LayoutNode, leafId: string): LayoutNode {
  if (tree.type === 'leaf') return tree
  const [left, right] = tree.children
  if (left.type === 'leaf' && left.id === leafId) return right
  if (right.type === 'leaf' && right.id === leafId) return left
  const newLeft = closeLeaf(left, leafId)
  const newRight = closeLeaf(right, leafId)
  if (newLeft !== left || newRight !== right) {
    return { ...tree, children: [newLeft, newRight] }
  }
  return tree
}

export function changeLeafPane(tree: LayoutNode, leafId: string, paneType: PaneId): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    const activeTab = getActiveTab(tree)
    return {
      ...tree,
      tabs: tree.tabs.map(t => t.id === activeTab.id ? { ...t, paneType } : t),
    }
  }
  return {
    ...tree,
    children: [
      changeLeafPane(tree.children[0], leafId, paneType),
      changeLeafPane(tree.children[1], leafId, paneType),
    ],
  }
}

// Add a new tab to a leaf
export function addTabToLeaf(tree: LayoutNode, leafId: string, tab: TabEntry): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    return { ...tree, tabs: [...tree.tabs, tab], activeTabId: tab.id }
  }
  return {
    ...tree,
    children: [
      addTabToLeaf(tree.children[0], leafId, tab),
      addTabToLeaf(tree.children[1], leafId, tab),
    ],
  }
}

// Remove a tab from a leaf (returns null if leaf should be closed)
export function removeTabFromLeaf(tree: LayoutNode, leafId: string, tabId: string): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    const remaining = tree.tabs.filter(t => t.id !== tabId)
    if (remaining.length === 0) return tree // caller should close leaf instead
    const newActiveId = tree.activeTabId === tabId
      ? remaining[Math.max(0, tree.tabs.findIndex(t => t.id === tabId) - 1)].id
      : tree.activeTabId
    return { ...tree, tabs: remaining, activeTabId: newActiveId }
  }
  return {
    ...tree,
    children: [
      removeTabFromLeaf(tree.children[0], leafId, tabId),
      removeTabFromLeaf(tree.children[1], leafId, tabId),
    ],
  }
}

// Set the active tab in a leaf
export function setActiveTabInLeaf(tree: LayoutNode, leafId: string, tabId: string): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    return { ...tree, activeTabId: tabId }
  }
  return {
    ...tree,
    children: [
      setActiveTabInLeaf(tree.children[0], leafId, tabId),
      setActiveTabInLeaf(tree.children[1], leafId, tabId),
    ],
  }
}

// Move a tab to a new position within the same leaf
export function reorderTabInLeaf(tree: LayoutNode, leafId: string, tabId: string, toIndex: number): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== leafId) return tree
    const fromIndex = tree.tabs.findIndex(t => t.id === tabId)
    if (fromIndex === -1 || fromIndex === toIndex) return tree
    const tabs = [...tree.tabs]
    const [moved] = tabs.splice(fromIndex, 1)
    tabs.splice(toIndex, 0, moved)
    return { ...tree, tabs }
  }
  return {
    ...tree,
    children: [
      reorderTabInLeaf(tree.children[0], leafId, tabId, toIndex),
      reorderTabInLeaf(tree.children[1], leafId, tabId, toIndex),
    ],
  }
}

export function updateSplitSizes(tree: LayoutNode, splitId: string, sizes: [number, number]): LayoutNode {
  if (tree.type === 'leaf') return tree
  if (tree.id === splitId) return { ...tree, sizes }
  return {
    ...tree,
    children: [
      updateSplitSizes(tree.children[0], splitId, sizes),
      updateSplitSizes(tree.children[1], splitId, sizes),
    ],
  }
}

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'

export function splitLeafAtPosition(
  tree: LayoutNode,
  targetLeafId: string,
  direction: 'horizontal' | 'vertical',
  newLeafId: string,
  newSplitId: string,
  newPaneType: PaneId,
  insertBefore: boolean,
): LayoutNode {
  if (tree.type === 'leaf') {
    if (tree.id !== targetLeafId) return tree
    const newLeaf = mkLeaf(newLeafId, newPaneType)
    return {
      type: 'split',
      id: newSplitId,
      direction,
      children: insertBefore ? [newLeaf, { ...tree }] : [{ ...tree }, newLeaf],
      sizes: [50, 50],
    }
  }
  return {
    ...tree,
    children: [
      splitLeafAtPosition(tree.children[0], targetLeafId, direction, newLeafId, newSplitId, newPaneType, insertBefore),
      splitLeafAtPosition(tree.children[1], targetLeafId, direction, newLeafId, newSplitId, newPaneType, insertBefore),
    ],
  }
}

export function getSiblingLeafId(tree: LayoutNode, leafId: string): string | null {
  if (tree.type === 'leaf') return null
  const [left, right] = tree.children
  if (left.type === 'leaf' && left.id === leafId) return getFirstLeafId(right)
  if (right.type === 'leaf' && right.id === leafId) return getFirstLeafId(left)
  return getSiblingLeafId(left, leafId) ?? getSiblingLeafId(right, leafId)
}

function getFirstLeafId(tree: LayoutNode): string {
  if (tree.type === 'leaf') return tree.id
  return getFirstLeafId(tree.children[0])
}
