// The ACP host: spawns agent subprocesses, owns one ACP session per subprocess,
// and translates between the ACP wire protocol and the Ghosted 2.0 WebSocket
// contract in ../shared/protocol.

import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';

import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type Client,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from '@agentclientprotocol/sdk';

import type {
  AcpUpdate,
  PermissionRequest,
  ServerMsg,
  SessionMeta,
  SessionStatus,
  UpdateRecord,
} from '../shared/protocol';
import { listAgents, resolveAgentCommand } from './agents';
import { createGuard, type Guard } from './fsGuard';

const HISTORY_CAP = 2000;

/**
 * Agent modes, in descending order of restrictiveness. Used by 'safe' sessions
 * to pick a mode out of whatever the agent advertised in its session/new
 * response (the claude adapter offers plan / default / acceptEdits / …).
 */
const RESTRICTIVE_MODE_PATTERNS = [/^plan$/i, /plan/i, /^ask$/i, /read[-_ ]?only/i, /safe/i, /review/i];

interface PendingPermission {
  request: PermissionRequest;
  resolve: (response: RequestPermissionResponse) => void;
}

interface AgentMode {
  id: string;
  name: string;
}

interface SessionRecord {
  meta: SessionMeta;
  child: ChildProcess;
  /** set immediately after the stream is wired; null only during construction */
  conn: ClientSideConnection | null;
  /** the agent's own session id — ours is meta.id */
  acpSessionId: string;
  seq: number;
  history: UpdateRecord[];
  pending: Map<string, PendingPermission>;
  /** modes the agent advertised at session/new, if any */
  modes: { currentModeId: string; availableModes: AgentMode[] } | null;
}

export type PermissionMode = NonNullable<SessionMeta['permissionMode']>;

export interface CreateSessionOptions {
  cwd?: string;
  /** defaults to 'default' */
  permissionMode?: PermissionMode;
}

export interface AcpHostOptions {
  /** workspace root — used to build the default single-root guard */
  root?: string;
  /**
   * Custom path confinement. Hosts with a live grant system (the Electron main
   * process) pass their own `assertAllowed` here instead of a fixed root.
   */
  guard?: Guard;
  broadcast: (msg: ServerMsg) => void;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The most permissive option an agent offered, or null if it offered none. */
function pickAllowOption(options: PermissionRequest['options']): string | null {
  const byKind = (kind: string) => options.find((o) => o.kind === kind)?.optionId;
  return (
    byKind('allow_always') ??
    byKind('allow_once') ??
    options.find((o) => /allow/i.test(o.kind ?? '') || /allow/i.test(o.name))?.optionId ??
    null
  );
}

export class AcpHost {
  private readonly guard: Guard;
  private readonly broadcast: (msg: ServerMsg) => void;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(opts: AcpHostOptions) {
    this.guard = opts.guard ?? createGuard(opts.root ?? process.cwd());
    this.broadcast = opts.broadcast;
  }

  get root(): string {
    return this.guard.root;
  }

  // ---------- lifecycle ----------

  /**
   * `opts` is backward compatible: a bare string is still read as the cwd, so
   * existing `createSession(agentId, cwd)` call sites keep working untouched.
   */
  async createSession(agentId: string, opts?: string | CreateSessionOptions): Promise<SessionMeta> {
    const cmd = resolveAgentCommand(agentId);
    if (!cmd) throw new Error(`unknown agent: ${agentId}`);

    const { cwd, permissionMode = 'default' }: CreateSessionOptions =
      typeof opts === 'string' ? { cwd: opts } : (opts ?? {});

    const agentName = listAgents().find((a) => a.id === agentId)?.name ?? agentId;
    const sessionCwd = cwd ? this.guard.assertAllowed(cwd) : this.guard.root;

    const child = spawn(cmd.command, cmd.args, {
      cwd: sessionCwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    if (!child.stdin || !child.stdout) {
      child.kill();
      throw new Error('agent process has no stdio pipes');
    }

    const id = randomUUID();
    const meta: SessionMeta = {
      id,
      agentId,
      agentName,
      cwd: sessionCwd,
      createdAt: Date.now(),
      status: 'starting',
      permissionMode,
    };
    const rec: SessionRecord = {
      meta,
      child,
      conn: null,
      acpSessionId: '',
      seq: 0,
      history: [],
      pending: new Map(),
      modes: null,
    };
    this.sessions.set(id, rec);

    child.on('error', (err) => {
      this.setStatus(rec, 'error', errText(err));
    });
    child.on('exit', () => {
      this.cancelPending(rec);
      if (rec.meta.status !== 'error') this.setStatus(rec, 'exited');
    });

    const stream = ndJsonStream(
      Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
      Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    );
    const conn = new ClientSideConnection(() => this.makeClient(rec), stream);
    rec.conn = conn;

    try {
      await conn.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
        clientInfo: { name: 'ghosted2', version: '0.1.0' },
      });
      const created = await conn.newSession({ cwd: sessionCwd, mcpServers: [] });
      rec.acpSessionId = created.sessionId;
      rec.modes = created.modes ?? null;
    } catch (e) {
      this.sessions.delete(id);
      child.kill();
      throw new Error(`agent handshake failed: ${errText(e)}`);
    }

    if (permissionMode === 'safe') await this.applySafeMode(rec);

    meta.status = 'idle';
    this.broadcast({ type: 'session.created', session: { ...meta } });
    this.broadcast({ type: 'session.status', sessionId: id, status: 'idle' });
    return { ...meta };
  }

  /**
   * 'safe' sessions ask the agent for its most restrictive advertised mode via
   * session/set_mode. Agents that advertise no modes (the mock, and any agent
   * predating session modes) simply behave like 'default'.
   */
  private async applySafeMode(rec: SessionRecord): Promise<void> {
    const available = rec.modes?.availableModes ?? [];
    if (available.length === 0) return;

    let target: AgentMode | undefined;
    for (const pattern of RESTRICTIVE_MODE_PATTERNS) {
      target = available.find((m) => pattern.test(m.id) || pattern.test(m.name));
      if (target) break;
    }
    if (!target || target.id === rec.modes?.currentModeId) return;

    try {
      await this.conn(rec).setSessionMode({ sessionId: rec.acpSessionId, modeId: target.id });
      if (rec.modes) rec.modes.currentModeId = target.id;
    } catch (e) {
      console.warn(`[acp] set_mode(${target.id}) rejected by ${rec.meta.agentId}: ${errText(e)}`);
    }
  }

  async prompt(sessionId: string, text: string): Promise<void> {
    const rec = this.require(sessionId);
    this.setStatus(rec, 'running');
    try {
      await this.conn(rec).prompt({
        sessionId: rec.acpSessionId,
        prompt: [{ type: 'text', text }],
      });
      this.setStatus(rec, 'idle');
    } catch (e) {
      this.setStatus(rec, 'error', errText(e));
    }
  }

  async cancel(sessionId: string): Promise<void> {
    const rec = this.require(sessionId);
    this.cancelPending(rec);
    await this.conn(rec).cancel({ sessionId: rec.acpSessionId });
    this.setStatus(rec, 'idle');
  }

  resolvePermission(sessionId: string, requestId: string, optionId: string): void {
    const rec = this.require(sessionId);
    const pending = rec.pending.get(requestId);
    if (!pending) throw new Error(`no pending permission ${requestId}`);
    rec.pending.delete(requestId);
    pending.resolve({ outcome: { outcome: 'selected', optionId } });
    this.setStatus(rec, 'running');
    this.broadcast({ type: 'permission.resolved', sessionId, requestId, optionId });
  }

  /** Kill every agent subprocess. Called on SIGINT. */
  shutdown(): void {
    for (const rec of this.sessions.values()) {
      this.cancelPending(rec);
      rec.child.kill();
    }
  }

  // ---------- reads ----------

  getSessions(): SessionMeta[] {
    return [...this.sessions.values()].map((r) => ({ ...r.meta }));
  }

  /** every session's history, oldest first */
  getHistory(): UpdateRecord[] {
    return [...this.sessions.values()]
      .flatMap((r) => r.history)
      .sort((a, b) => a.ts - b.ts || a.seq - b.seq);
  }

  getPendingPermissions(): PermissionRequest[] {
    return [...this.sessions.values()].flatMap((r) =>
      [...r.pending.values()].map((p) => p.request),
    );
  }

  // ---------- ACP client callbacks ----------

  private makeClient(rec: SessionRecord): Client {
    return {
      sessionUpdate: (params: SessionNotification): void => {
        // One connection == one session, so params.sessionId is rec.acpSessionId;
        // we re-key onto our own id before it crosses the WebSocket.
        this.pushUpdate(rec, params.update as AcpUpdate);
      },

      requestPermission: (params: RequestPermissionRequest) =>
        this.handlePermission(rec, params),

      readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
        const abs = this.guard.assertAllowed(params.path);
        const raw = await fs.readFile(abs, 'utf8');
        if (params.line == null && params.limit == null) return { content: raw };
        const lines = raw.split('\n');
        const start = params.line != null ? Math.max(0, params.line - 1) : 0;
        const end = params.limit != null ? start + params.limit : lines.length;
        return { content: lines.slice(start, end).join('\n') };
      },

      writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
        const abs = this.guard.assertAllowed(params.path);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, params.content, 'utf8');
        return {};
      },
    };
  }

  private handlePermission(
    rec: SessionRecord,
    params: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    const requestId = randomUUID();
    const request: PermissionRequest = {
      sessionId: rec.meta.id,
      requestId,
      toolCall: params.toolCall,
      title: params.toolCall?.title ?? undefined,
      options: params.options.map((o) => ({
        optionId: o.optionId,
        name: o.name,
        kind: o.kind,
      })),
    };

    // 'full' never blocks on a human: take the most permissive option the agent
    // offered and only announce the resolution, so UIs can still log the grant.
    // Agents that offer no allow-ish option fall through to the pending path.
    if (rec.meta.permissionMode === 'full') {
      const optionId = pickAllowOption(request.options);
      if (optionId) {
        this.broadcast({
          type: 'permission.resolved',
          sessionId: rec.meta.id,
          requestId,
          optionId,
        });
        return Promise.resolve({ outcome: { outcome: 'selected', optionId } });
      }
    }

    return new Promise<RequestPermissionResponse>((resolve) => {
      rec.pending.set(requestId, { request, resolve });
      this.setStatus(rec, 'awaiting-permission');
      this.broadcast({ type: 'permission.request', request });
    });
  }

  // ---------- internals ----------

  private pushUpdate(rec: SessionRecord, update: AcpUpdate): void {
    const record: UpdateRecord = {
      sessionId: rec.meta.id,
      seq: ++rec.seq,
      ts: Date.now(),
      update,
    };
    rec.history.push(record);
    if (rec.history.length > HISTORY_CAP) rec.history.shift();
    this.broadcast({ type: 'session.update', record });
  }

  private setStatus(rec: SessionRecord, status: SessionStatus, error?: string): void {
    rec.meta.status = status;
    if (error) rec.meta.error = error;
    else delete rec.meta.error;
    this.broadcast({ type: 'session.status', sessionId: rec.meta.id, status, error });
  }

  /** Resolve every outstanding permission with the ACP cancelled outcome. */
  private cancelPending(rec: SessionRecord): void {
    for (const [requestId, pending] of rec.pending) {
      rec.pending.delete(requestId);
      pending.resolve({ outcome: { outcome: 'cancelled' } });
      this.broadcast({
        type: 'permission.resolved',
        sessionId: rec.meta.id,
        requestId,
        optionId: '',
      });
    }
  }

  private require(sessionId: string): SessionRecord {
    const rec = this.sessions.get(sessionId);
    if (!rec) throw new Error(`unknown session: ${sessionId}`);
    return rec;
  }

  private conn(rec: SessionRecord): ClientSideConnection {
    if (!rec.conn) throw new Error(`session ${rec.meta.id} is not connected`);
    return rec.conn;
  }
}
