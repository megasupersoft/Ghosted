/**
 * Agents store — thin renderer-side mirror of the ACP (Agent Client Protocol)
 * host state, pushed over `window.electron.acp`. Mirrors the shape of the
 * ghosted2 standalone's store.ts (ghosted2/src/store.ts) but adapted to the
 * feature-detected, optional `acp` bridge: when it's absent (web preview
 * without the Electron bridge, or a build that hasn't wired it up yet) the
 * store just reports `available: false` and every action is a no-op.
 */

import { create } from 'zustand'
import type { AgentInfo, PermissionRequest, SessionMeta, UpdateRecord } from '@/types/acp'

const MAX_UPDATES = 5000

export interface AgentsState {
  available: boolean
  agents: AgentInfo[]
  sessions: SessionMeta[]
  updates: UpdateRecord[] // flat, capped at 5000, oldest dropped
  pendingPermissions: PermissionRequest[]
  selectedSessionId: string | null
  init(): void // idempotent; feature-detects window.electron.acp, subscribes pushes, fetches agents+sessions
  newSession(agentId: string): Promise<void> // selects the new session
  prompt(text: string): Promise<void> // acts on selectedSessionId
  cancel(): void
  decide(requestId: string, optionId: string): void
  select(id: string | null): void
}

let initialized = false

function upsertSession(sessions: SessionMeta[], session: SessionMeta): SessionMeta[] {
  return [...sessions.filter((s) => s.id !== session.id), session]
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  available: false,
  agents: [],
  sessions: [],
  updates: [],
  pendingPermissions: [],
  selectedSessionId: null,

  init: () => {
    if (initialized) return
    initialized = true

    const acp = window.electron?.acp
    if (!acp) {
      set({ available: false })
      return
    }
    set({ available: true })

    acp.onUpdate((record) => {
      set((s) => {
        let updates = [...s.updates, record]
        if (updates.length > MAX_UPDATES) updates = updates.slice(updates.length - MAX_UPDATES)
        return { updates }
      })
    })

    acp.onStatus(({ sessionId, status, error }) => {
      set((s) => ({
        sessions: s.sessions.map((sess) => (sess.id === sessionId ? { ...sess, status, error } : sess)),
      }))
    })

    acp.onPermission((request) => {
      set((s) => ({ pendingPermissions: [...s.pendingPermissions, request] }))
    })

    acp.onPermissionResolved(({ sessionId, requestId }) => {
      set((s) => ({
        pendingPermissions: s.pendingPermissions.filter(
          (p) => !(p.sessionId === sessionId && p.requestId === requestId),
        ),
      }))
    })

    acp.onSession((session) => {
      set((s) => ({ sessions: upsertSession(s.sessions, session) }))
    })

    acp
      .agents()
      .then((agents) => set({ agents }))
      .catch(() => {})
    acp
      .sessions()
      .then((sessions) => set({ sessions }))
      .catch(() => {})
  },

  newSession: async (agentId) => {
    const acp = window.electron?.acp
    if (!acp) return
    const session = await acp.create(agentId)
    set((s) => ({ sessions: upsertSession(s.sessions, session), selectedSessionId: session.id }))
  },

  prompt: async (text) => {
    const acp = window.electron?.acp
    const sessionId = get().selectedSessionId
    if (!acp || !sessionId) return
    await acp.prompt(sessionId, text)
  },

  cancel: () => {
    const acp = window.electron?.acp
    const sessionId = get().selectedSessionId
    if (!acp || !sessionId) return
    void acp.cancel(sessionId)
  },

  decide: (requestId, optionId) => {
    const acp = window.electron?.acp
    const req = get().pendingPermissions.find((p) => p.requestId === requestId)
    if (!acp || !req) return
    void acp.decide(req.sessionId, requestId, optionId)
  },

  select: (id) => set({ selectedSessionId: id }),
}))
