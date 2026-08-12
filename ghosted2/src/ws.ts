import { WS_URL, type ClientMsg, type ServerMsg } from '../shared/protocol';
import { useStore } from './store';

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8000;

let socket: WebSocket | null = null;
let backoffMs = MIN_BACKOFF_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let started = false;

function send(msg: ClientMsg): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  } else {
    console.warn('[ws] dropped message, socket not open', msg);
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

function connect(): void {
  useStore.getState().setConnStatus('connecting');
  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.onopen = () => {
    backoffMs = MIN_BACKOFF_MS;
    useStore.getState().setConnStatus('open');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data as string) as ServerMsg;
      useStore.getState().handleServerMsg(msg);
    } catch (err) {
      console.error('[ws] failed to parse ServerMsg', err, event.data);
    }
  };

  ws.onclose = () => {
    useStore.getState().setConnStatus('closed');
    socket = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose fires right after; let that path own reconnect scheduling.
    ws.close();
  };
}

/** Call once at app startup. Idempotent. */
export function initWs(): void {
  if (started) return;
  started = true;
  useStore.getState().setSender(send);
  connect();
}
