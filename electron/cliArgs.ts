import path from 'node:path'

/**
 * Pull a workspace directory out of a CLI argv slice.
 * Callers pass argv already stripped of the binary (and, in dev, the app
 * path): the first non-flag argument that resolves to an existing directory
 * wins. Relative paths resolve against the launching shell's cwd.
 */
/**
 * In dev, argv is `electron [-r module]... <app-path> [args...]` — strip the
 * binary, any require-hook pairs, and the app path itself so only real user
 * arguments remain. (Packaged apps just slice off the binary.)
 */
export function devCliArgs(argv: string[]): string[] {
  const out: string[] = []
  let skipNext = false
  let appPathSkipped = false
  for (const a of argv.slice(1)) {
    if (skipNext) {
      skipNext = false
      continue
    }
    if (a === '-r' || a === '--require') {
      skipNext = true
      continue
    }
    if (!a.startsWith('-') && !appPathSkipped) {
      appPathSkipped = true
      continue
    }
    out.push(a)
  }
  return out
}

export function extractWorkspaceArg(
  args: string[],
  cwd: string,
  isDirectory: (p: string) => boolean,
): string | null {
  for (const arg of args) {
    if (!arg || arg.startsWith('-')) continue
    const resolved = path.resolve(cwd, arg)
    if (isDirectory(resolved)) return resolved
  }
  return null
}
