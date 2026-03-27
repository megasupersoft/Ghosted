/**
 * useUndoStack — generic undo/redo for snapshottable state.
 * Stores JSON snapshots capped at maxSize.
 */

import { useRef, useCallback } from 'react'

interface UndoStack<T> {
  push: (state: T) => void
  undo: () => T | null
  redo: () => T | null
  canUndo: () => boolean
  canRedo: () => boolean
  reset: (state: T) => void
  /** Mark the current position as "saved" — isDirty compares against this */
  markSaved: () => void
  /** Whether the current position differs from the last save point */
  isDirty: () => boolean
}

export function useUndoStack<T>(maxSize = 50): UndoStack<T> {
  const stack = useRef<string[]>([])
  const pointer = useRef(-1)
  const savedPointer = useRef(-1)

  const push = useCallback((state: T) => {
    const json = JSON.stringify(state)
    // If current state is same as top of stack, skip
    if (pointer.current >= 0 && stack.current[pointer.current] === json) return
    // Discard any redo history
    stack.current = stack.current.slice(0, pointer.current + 1)
    stack.current.push(json)
    // Cap size
    if (stack.current.length > maxSize) {
      const removed = stack.current.length - maxSize
      stack.current = stack.current.slice(removed)
      pointer.current -= removed
      savedPointer.current -= removed
    }
    pointer.current = stack.current.length - 1
  }, [maxSize])

  const undo = useCallback((): T | null => {
    if (pointer.current <= 0) return null
    pointer.current--
    return JSON.parse(stack.current[pointer.current])
  }, [])

  const redo = useCallback((): T | null => {
    if (pointer.current >= stack.current.length - 1) return null
    pointer.current++
    return JSON.parse(stack.current[pointer.current])
  }, [])

  const canUndo = useCallback(() => pointer.current > 0, [])
  const canRedo = useCallback(() => pointer.current < stack.current.length - 1, [])

  const reset = useCallback((state: T) => {
    stack.current = [JSON.stringify(state)]
    pointer.current = 0
    savedPointer.current = 0
  }, [])

  const markSaved = useCallback(() => {
    savedPointer.current = pointer.current
  }, [])

  const isDirty = useCallback(() => {
    return pointer.current !== savedPointer.current
  }, [])

  return { push, undo, redo, canUndo, canRedo, reset, markSaved, isDirty }
}
