// Ghosted 2.0 server entry: two WebSocket endpoints on one port.
//   /       — the mission-control protocol (../shared/protocol)
//   /bridge — the Electron-IPC bridge for the legacy renderer (../shared/bridge)
// Both are fed by the same AcpHost instance.

import http from 'node:http';
import path from 'node:path';
import { WebSocketServer, type WebSocket } from 'ws';

import { BRIDGE_PATH } from '../shared/bridge';
import { WS_PORT, type ClientMsg, type ServerMsg } from '../shared/protocol';
import { AcpHost } from './acpHost';
import { listAgents } from './agents';
import { createBridge, type Bridge } from './bridge';

const root = path.resolve(process.env.GHOSTED2_ROOT || process.cwd());

const clients = new Set<WebSocket>();

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

// Assigned right after the host is built; the host's own broadcasts fan out to
// mission-control clients AND (re-keyed as acp:* pushes) to bridge clients.
let bridge: Bridge | null = null;

function broadcast(msg: ServerMsg): void {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) ws.send(data);
  }
  bridge?.acpBroadcast(msg);
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const host = new AcpHost({ root, broadcast });
bridge = createBridge({ root, host });

function handle(ws: WebSocket, msg: ClientMsg): void {
  switch (msg.type) {
    case 'agents.list':
      send(ws, { type: 'agents.list', agents: listAgents() });
      break;

    case 'sessions.list':
      send(ws, { type: 'sessions.list', sessions: host.getSessions() });
      break;

    case 'session.new':
      host.createSession(msg.agentId, msg.cwd).catch((e: unknown) => {
        send(ws, { type: 'error', message: errText(e) });
      });
      break;

    case 'session.prompt':
      host.prompt(msg.sessionId, msg.text).catch((e: unknown) => {
        send(ws, { type: 'error', message: errText(e), sessionId: msg.sessionId });
      });
      break;

    case 'session.cancel':
      host.cancel(msg.sessionId).catch((e: unknown) => {
        send(ws, { type: 'error', message: errText(e), sessionId: msg.sessionId });
      });
      break;

    case 'permission.decision':
      host.resolvePermission(msg.sessionId, msg.requestId, msg.optionId);
      break;

    default: {
      const unknown = msg as { type?: string };
      send(ws, { type: 'error', message: `unknown message type: ${String(unknown.type)}` });
    }
  }
}

const httpServer = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('ghosted2: WebSocket only\n');
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const target = pathname === BRIDGE_PATH ? bridge?.wss : wss;
  if (!target) {
    socket.destroy();
    return;
  }
  target.handleUpgrade(request, socket, head, (ws) => target.emit('connection', ws, request));
});

httpServer.listen(WS_PORT);

wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);

  // Replay the whole world so a fresh tab is indistinguishable from a live one.
  send(ws, { type: 'hello', workspaceRoot: root });
  send(ws, { type: 'agents.list', agents: listAgents() });
  send(ws, { type: 'sessions.list', sessions: host.getSessions() });
  for (const record of host.getHistory()) send(ws, { type: 'session.update', record });
  for (const request of host.getPendingPermissions()) {
    send(ws, { type: 'permission.request', request });
  }

  ws.on('message', (data: unknown) => {
    let msg: ClientMsg;
    try {
      msg = JSON.parse(String(data)) as ClientMsg;
    } catch {
      send(ws, { type: 'error', message: 'invalid JSON' });
      return;
    }
    try {
      handle(ws, msg);
    } catch (e) {
      send(ws, { type: 'error', message: errText(e) });
    }
  });

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

console.log(`[ghosted2] ACP host listening on ws://localhost:${WS_PORT} — root ${root}`);
console.log(`[ghosted2] web bridge listening on ws://localhost:${WS_PORT}${BRIDGE_PATH}`);

let shuttingDown = false;
function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[ghosted2] shutting down…');
  host.shutdown();
  bridge?.shutdown();
  wss.close();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
