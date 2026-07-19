/**
 * Ghosted RPC — a local socket (unix socket / Windows named pipe) that lets
 * processes inside Ghosted's terminal drive the app: the pi CLI, scripts, or
 * `ghosted open <file>`.
 *
 * Protocol: newline-delimited JSON. Request `{ id?, method, params? }` →
 * response `{ id, ok, result }` or `{ id, ok: false, error }`.
 */

import net from 'node:net'

export type RpcHandler = (params: Record<string, unknown>) => unknown | Promise<unknown>
export type RpcHandlers = Record<string, RpcHandler>

export interface RpcResponse {
  id: string | number | null
  ok: boolean
  result?: unknown
  error?: string
}

/** Dispatch a single request line against the handler table. Never throws. */
export async function dispatchRpcLine(line: string, handlers: RpcHandlers): Promise<RpcResponse> {
  let id: string | number | null = null
  try {
    const msg = JSON.parse(line)
    id = typeof msg.id === 'string' || typeof msg.id === 'number' ? msg.id : null
    const method = msg.method
    if (typeof method !== 'string' || !(method in handlers)) {
      return { id, ok: false, error: `unknown method: ${String(method)}` }
    }
    const params = msg.params && typeof msg.params === 'object' ? (msg.params as Record<string, unknown>) : {}
    const result = await handlers[method](params)
    return { id, ok: true, result: result ?? null }
  } catch (err) {
    return { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Stateful \n-splitter that survives requests fragmented across TCP chunks. */
export function makeLineSplitter(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buffer = ''
  return (chunk) => {
    buffer += chunk.toString()
    let idx = buffer.indexOf('\n')
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line) onLine(line)
      idx = buffer.indexOf('\n')
    }
  }
}

export function startRpcServer(socketPath: string, handlers: RpcHandlers): net.Server {
  const server = net.createServer((socket) => {
    const feed = makeLineSplitter((line) => {
      void dispatchRpcLine(line, handlers).then((res) => {
        if (!socket.destroyed) socket.write(`${JSON.stringify(res)}\n`)
      })
    })
    socket.on('data', feed)
    socket.on('error', () => {})
  })
  server.on('error', () => {})
  server.listen(socketPath)
  return server
}
