import { create } from 'zustand';
import type {
  AgentInfo,
  ClientMsg,
  PermissionRequest,
  ServerMsg,
  SessionMeta,
  UpdateRecord,
} from '../shared/protocol';

export type ConnStatus = 'connecting' | 'open' | 'closed';

const MAX_UPDATES = 5000;

/** Dedup set for session.update replay after reconnect. Reset on 'hello'. */
const seenUpdateKeys = new Set<string>();

interface GhostedState {
  connStatus: ConnStatus;
  workspaceRoot: string;
  agents: AgentInfo[];
  sessions: SessionMeta[];
  updates: UpdateRecord[];
  pendingPermissions: PermissionRequest[];
  selectedSessionId: string | null;

  /** Wired up by ws.ts once, at module init. */
  sendMsg: (msg: ClientMsg) => void;
  setConnStatus: (status: ConnStatus) => void;
  setSender: (sender: (msg: ClientMsg) => void) => void;

  handleServerMsg: (msg: ServerMsg) => void;
  selectSession: (id: string) => void;

  newSession: (agentId: string) => void;
  prompt: (text: string) => void;
  cancelSession: () => void;
  decide: (requestId: string, optionId: string) => void;
}

export const useStore = create<GhostedState>((set, get) => ({
  connStatus: 'connecting',
  workspaceRoot: '',
  agents: [],
  sessions: [],
  updates: [],
  pendingPermissions: [],
  selectedSessionId: null,

  sendMsg: () => {
    console.warn('[store] sendMsg called before ws sender was wired up');
  },
  setConnStatus: (status) => set({ connStatus: status }),
  setSender: (sender) => set({ sendMsg: sender }),

  selectSession: (id) => set({ selectedSessionId: id }),

  handleServerMsg: (msg) => {
    switch (msg.type) {
      case 'hello': {
        seenUpdateKeys.clear();
        set({
          workspaceRoot: msg.workspaceRoot,
          sessions: [],
          updates: [],
          pendingPermissions: [],
          selectedSessionId: null,
        });
        return;
      }
      case 'agents.list': {
        set({ agents: msg.agents });
        return;
      }
      case 'sessions.list': {
        set({ sessions: msg.sessions });
        return;
      }
      case 'session.created': {
        set((s) => ({
          sessions: [...s.sessions.filter((sess) => sess.id !== msg.session.id), msg.session],
          selectedSessionId: msg.session.id,
        }));
        return;
      }
      case 'session.status': {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === msg.sessionId ? { ...sess, status: msg.status, error: msg.error } : sess,
          ),
        }));
        return;
      }
      case 'session.update': {
        const key = `${msg.record.sessionId}:${msg.record.seq}`;
        if (seenUpdateKeys.has(key)) return;
        seenUpdateKeys.add(key);
        set((s) => {
          let updates = [...s.updates, msg.record];
          if (updates.length > MAX_UPDATES) {
            updates = updates.slice(updates.length - MAX_UPDATES);
          }
          return { updates };
        });
        return;
      }
      case 'permission.request': {
        set((s) => ({ pendingPermissions: [...s.pendingPermissions, msg.request] }));
        return;
      }
      case 'permission.resolved': {
        set((s) => ({
          pendingPermissions: s.pendingPermissions.filter(
            (p) => !(p.sessionId === msg.sessionId && p.requestId === msg.requestId),
          ),
        }));
        return;
      }
      case 'error': {
        console.error('[server error]', msg.message, msg.sessionId ? `(session ${msg.sessionId})` : '');
        return;
      }
      default: {
        const _exhaustive: never = msg;
        console.warn('[store] unknown ServerMsg', _exhaustive);
      }
    }
  },

  newSession: (agentId) => {
    get().sendMsg({ type: 'session.new', agentId });
  },
  prompt: (text) => {
    const sessionId = get().selectedSessionId;
    if (!sessionId) {
      console.warn('[store] prompt() called with no selected session');
      return;
    }
    get().sendMsg({ type: 'session.prompt', sessionId, text });
  },
  cancelSession: () => {
    const sessionId = get().selectedSessionId;
    if (!sessionId) {
      console.warn('[store] cancelSession() called with no selected session');
      return;
    }
    get().sendMsg({ type: 'session.cancel', sessionId });
  },
  decide: (requestId, optionId) => {
    const req = get().pendingPermissions.find((p) => p.requestId === requestId);
    if (!req) {
      console.warn('[store] decide() called for unknown requestId', requestId);
      return;
    }
    get().sendMsg({ type: 'permission.decision', sessionId: req.sessionId, requestId, optionId });
  },
}));
