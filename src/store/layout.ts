// Layout tree types and pure transform functions

export type PaneId = 'editor' | 'terminal' | 'graph' | 'canvas' | 'kanban'

export interface LeafNode {
  type: 'leaf'
  id: string
  paneType: PaneId
}

export interface SplitNode {
  type: 'split'
  id: string
  direction: 'horizontal' | 'vertical'
  children: [LayoutNode, LayoutNode]
  sizes: [number, number]
}

export type LayoutNode = LeafNode | SplitNode

export const DEFAULT_LAYOUT: LayoutNode = { type: 'leaf', id: 'leaf-1', paneType: 'editor' }

export function findLeaf(tree: LayoutNode, leafId: string): LeafNode | null {
  if (tree.type === 'leaf') return tree.id === leafId ? tree : null
  return findLeaf(tree.children[0], leafId) ?? findLeaf(tree.children[1], leafId)
}

export function countLeaves(tree: LayoutNode): number {
  if (tree.type === 'leaf') return 1
  return countLeaves(tree.children[0]) + countLeaves(tree.children[1])
}

export function findFirstLeafByPane(tree: LayoutNode, paneType: PaneId): LeafNode | null {
  if (tree.type === 'leaf') return tree.paneType === paneType ? tree : null
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
    return {
      type: 'split',
      id: newSplitId,
      direction,
      children: [
        { ...tree },
        { type: 'leaf', id: newLeafId, paneType: tree.paneType },
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
  // If the leaf to close is a direct child, return the sibling
  if (left.type === 'leaf' && left.id === leafId) return right
  if (right.type === 'leaf' && right.id === leafId) return left
  // Recurse
  const newLeft = closeLeaf(left, leafId)
  const newRight = closeLeaf(right, leafId)
  // If a child split collapsed, it may have been replaced
  if (newLeft !== left || newRight !== right) {
    return { ...tree, children: [newLeft, newRight] }
  }
  return tree
}

export function changeLeafPane(tree: LayoutNode, leafId: string, paneType: PaneId): LayoutNode {
  if (tree.type === 'leaf') {
    return tree.id === leafId ? { ...tree, paneType } : tree
  }
  return {
    ...tree,
    children: [
      changeLeafPane(tree.children[0], leafId, paneType),
      changeLeafPane(tree.children[1], leafId, paneType),
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

// Insert a new leaf at a specific position relative to a target leaf
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
    const newLeaf: LeafNode = { type: 'leaf', id: newLeafId, paneType: newPaneType }
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

// Get the sibling leaf id when closing a leaf
export function getSiblingLeafId(tree: LayoutNode, leafId: string): string | null {
  if (tree.type === 'leaf') return null
  const [left, right] = tree.children
  if (left.type === 'leaf' && left.id === leafId) {
    // Return the first leaf of the sibling subtree
    return getFirstLeafId(right)
  }
  if (right.type === 'leaf' && right.id === leafId) {
    return getFirstLeafId(left)
  }
  return getSiblingLeafId(left, leafId) ?? getSiblingLeafId(right, leafId)
}

function getFirstLeafId(tree: LayoutNode): string {
  if (tree.type === 'leaf') return tree.id
  return getFirstLeafId(tree.children[0])
}
