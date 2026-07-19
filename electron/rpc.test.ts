import { describe, expect, it, vi } from 'vitest'
import { dispatchRpcLine, makeLineSplitter } from './rpc'

const handlers = {
  ping: () => 'pong',
  echo: (p: Record<string, unknown>) => p.value,
  boom: () => {
    throw new Error('handler exploded')
  },
  asyncAdd: async (p: Record<string, unknown>) => (p.a as number) + (p.b as number),
}

describe('dispatchRpcLine', () => {
  it('dispatches a valid request and echoes the id', async () => {
    const res = await dispatchRpcLine('{"id":1,"method":"ping"}', handlers)
    expect(res).toEqual({ id: 1, ok: true, result: 'pong' })
  })

  it('passes params and supports async handlers', async () => {
    const res = await dispatchRpcLine('{"id":"x","method":"asyncAdd","params":{"a":2,"b":3}}', handlers)
    expect(res).toEqual({ id: 'x', ok: true, result: 5 })
  })

  it('rejects unknown methods', async () => {
    const res = await dispatchRpcLine('{"id":2,"method":"nope"}', handlers)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('unknown method')
  })

  it('survives malformed JSON', async () => {
    const res = await dispatchRpcLine('{oops', handlers)
    expect(res.ok).toBe(false)
    expect(res.id).toBeNull()
  })

  it('turns handler throws into error responses', async () => {
    const res = await dispatchRpcLine('{"id":3,"method":"boom"}', handlers)
    expect(res).toEqual({ id: 3, ok: false, error: 'handler exploded' })
  })

  it('normalizes missing result to null', async () => {
    const res = await dispatchRpcLine('{"id":4,"method":"echo"}', handlers)
    expect(res).toEqual({ id: 4, ok: true, result: null })
  })
})

describe('makeLineSplitter', () => {
  it('reassembles lines split across chunks', () => {
    const seen: string[] = []
    const feed = makeLineSplitter((l) => seen.push(l))
    feed('{"id"')
    feed(':1}\n{"id":2}\n{"id"')
    feed(':3}\n')
    expect(seen).toEqual(['{"id":1}', '{"id":2}', '{"id":3}'])
  })

  it('ignores blank lines and trims whitespace', () => {
    const onLine = vi.fn()
    const feed = makeLineSplitter(onLine)
    feed('\n  \n{"a":1}  \n')
    expect(onLine).toHaveBeenCalledTimes(1)
    expect(onLine).toHaveBeenCalledWith('{"a":1}')
  })
})
