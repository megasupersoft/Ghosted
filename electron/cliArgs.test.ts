import { describe, expect, it } from 'vitest'
import { devCliArgs, extractWorkspaceArg } from './cliArgs'

const dirs = (...existing: string[]) => {
  const set = new Set(existing)
  return (p: string) => set.has(p)
}

describe('extractWorkspaceArg', () => {
  it('resolves a relative dir against the shell cwd', () => {
    expect(extractWorkspaceArg(['notes'], '/home/me', dirs('/home/me/notes'))).toBe('/home/me/notes')
  })

  it('resolves "." to the cwd', () => {
    expect(extractWorkspaceArg(['.'], '/home/me/project', dirs('/home/me/project'))).toBe('/home/me/project')
  })

  it('accepts absolute paths regardless of cwd', () => {
    expect(extractWorkspaceArg(['/srv/repo'], '/elsewhere', dirs('/srv/repo'))).toBe('/srv/repo')
  })

  it('skips flags and non-directories', () => {
    expect(
      extractWorkspaceArg(['--inspect=1234', '--no-sandbox', 'missing', '/real'], '/', dirs('/real')),
    ).toBe('/real')
  })

  it('returns null when nothing matches', () => {
    expect(extractWorkspaceArg(['--flag', 'nope'], '/', dirs())).toBeNull()
    expect(extractWorkspaceArg([], '/', dirs('/x'))).toBeNull()
  })

  it('takes the first matching directory', () => {
    expect(extractWorkspaceArg(['/a', '/b'], '/', dirs('/a', '/b'))).toBe('/a')
  })
})

describe('devCliArgs', () => {
  it('strips binary, require pairs, and the app path', () => {
    expect(
      devCliArgs(['electron', '-r', '/loader.js', '--no-sandbox', '--inspect=0', '.', '/tmp/ws']),
    ).toEqual(['--no-sandbox', '--inspect=0', '/tmp/ws'])
  })

  it('plain dev launch with no user args yields nothing', () => {
    expect(devCliArgs(['electron', '.'])).toEqual([])
  })

  it('dev launch with a workspace arg keeps it', () => {
    expect(devCliArgs(['electron', '.', '/home/me/proj'])).toEqual(['/home/me/proj'])
  })
})
