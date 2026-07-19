import net from 'node:net'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { type AppContext, launchWithWorkspace } from './helpers'

function rpcCall(socketPath: string, method: string, params?: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(socketPath, () => {
      socket.write(`${JSON.stringify({ id: 1, method, params })}\n`)
    })
    let buf = ''
    socket.on('data', (chunk) => {
      buf += chunk.toString()
      const idx = buf.indexOf('\n')
      if (idx >= 0) {
        socket.end()
        resolve(JSON.parse(buf.slice(0, idx)))
      }
    })
    socket.on('error', reject)
    setTimeout(() => reject(new Error('rpc timeout')), 5000)
  })
}

test.describe.configure({ mode: 'serial' })

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchWithWorkspace()
})

test.afterAll(async () => {
  await ctx?.app.close()
})

test('terminal RPC socket answers ping and exposes workspaces', async () => {
  const sock = path.join(ctx.userData, 'rpc.sock')
  expect((await rpcCall(sock, 'ping')).result).toBe('pong')
  const ws = await rpcCall(sock, 'workspaces')
  expect(ws.ok).toBe(true)
  expect(ws.result).toContain(ctx.workspace)
})

test('openFile over RPC opens the file in the editor', async () => {
  const sock = path.join(ctx.userData, 'rpc.sock')
  const res = await rpcCall(sock, 'openFile', { path: path.join(ctx.workspace, 'ideas.md') })
  expect(res.ok).toBe(true)
  await expect(ctx.window.locator('.leaf-pane-tab', { hasText: 'ideas.md' })).toBeVisible({
    timeout: 10000,
  })
})

test('switchPane over RPC opens a pane; invalid input is rejected', async () => {
  const sock = path.join(ctx.userData, 'rpc.sock')
  const res = await rpcCall(sock, 'switchPane', { pane: 'kanban' })
  expect(res.ok).toBe(true)
  await expect(ctx.window.locator('.leaf-pane-tab', { hasText: 'Kanban' })).toBeVisible({
    timeout: 10000,
  })

  const bad = await rpcCall(sock, 'switchPane', { pane: '../../etc' })
  expect(bad.ok).toBe(false)

  const missing = await rpcCall(sock, 'openFile', { path: '/definitely/not/here.md' })
  expect(missing.ok).toBe(false)
})

test('PTYs receive GHOSTED_SOCKET in their environment', async () => {
  const out = await ctx.window.evaluate(async () => {
    const chunks: string[] = []
    const id = 'rpc-env-probe'
    window.electron.pty.onData(id, (d) => chunks.push(d))
    await window.electron.pty.create(id, '', 80, 24)
    await window.electron.pty.write(id, 'echo SOCK=$GHOSTED_SOCKET\r')
    await new Promise((r) => setTimeout(r, 2000))
    await window.electron.pty.kill(id)
    window.electron.pty.removeListeners(id)
    return chunks.join('')
  })
  expect(out).toContain('rpc.sock')
})
