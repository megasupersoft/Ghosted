/**
 * useGhostDB — React hook for GhostedDB
 *
 * Automatically indexes the workspace when it opens.
 * Subscribes to db:changed for live updates.
 * Exposes query() and get() for components.
 */

import { useEffect, useCallback, useRef } from 'react'
import { useStore } from '@/store'
import type { GhostedQuery, GhostedQueryResult, GhostedFile, DBStats } from '@/types/electron'

export function useGhostDB() {
  const { workspacePath, dbStats, setDbStats, dbReady, setDbReady } = useStore()
  const indexing = useRef(false)

  // Index when workspace opens
  useEffect(() => {
    if (!workspacePath || indexing.current) return
    indexing.current = true
    setDbReady(false)

    window.electron.db.index(workspacePath)
      .then((stats: DBStats) => {
        setDbStats(stats)
        setDbReady(true)
        indexing.current = false
      })
      .catch(() => { indexing.current = false })
  }, [workspacePath, setDbStats, setDbReady])

  // Subscribe to live updates from watcher
  useEffect(() => {
    window.electron.db.onChange((stats: DBStats) => {
      setDbStats(stats)
    })
    return () => window.electron.db.offChange()
  }, [setDbStats])

  const query = useCallback(
    (q: GhostedQuery): Promise<GhostedQueryResult> => {
      return window.electron.db.query(q)
    },
    []
  )

  const get = useCallback(
    (filePath: string): Promise<GhostedFile | null> => {
      return window.electron.db.get(filePath)
    },
    []
  )

  return { query, get, stats: dbStats, ready: dbReady }
}
