export {}

// GhostedDB types (mirror of electron/ghostdb.ts)
export interface GhostedFile {
  path: string
  name: string
  ext: string
  relativePath: string
  frontmatter: Record<string, unknown>
  body: string
  wikilinks: string[]
  incomingLinks: string[]
  mtime: number
  size: number
}

export type QueryOp =
  | { field: string; op: 'eq';       value: unknown }
  | { field: string; op: 'neq';      value: unknown }
  | { field: string; op: 'exists'                   }
  | { field: string; op: 'contains'; value: string  }
  | { field: string; op: 'gt';       value: number  }
  | { field: string; op: 'lt';       value: number  }

export interface GhostedQuery {
  where?:      QueryOp[]
  ext?:        string | string[]
  linkedTo?:   string
  linkedFrom?: string
  contains?:   string
  limit?:      number
  offset?:     number
  orderBy?:    string
  orderDir?:   'asc' | 'desc'
}

export interface GhostedQueryResult {
  files: GhostedFile[]
  total: number
  took:  number
}

export interface DBStats {
  total:           number
  byExt:           Record<string, number>
  withFrontmatter: number
  workspace:       string
}

declare global {
  interface Window {
    electron: {
      fs: {
        readdir: (path: string) => Promise<{ name: string; path: string; isDirectory: boolean }[]>
        readfile: (path: string) => Promise<string>
        writefile: (path: string, content: string) => Promise<boolean>
        homedir: () => Promise<string>
        mkdir: (path: string) => Promise<boolean>
        newfile: (path: string, content?: string) => Promise<boolean>
        rename: (oldPath: string, newPath: string) => Promise<boolean>
        delete: (path: string) => Promise<boolean>
        copy: (src: string, dest: string) => Promise<boolean>
        exists: (path: string) => Promise<boolean>
        stat: (path: string) => Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: number } | null>
        watch: (path: string) => Promise<boolean>
        unwatch: (path: string) => Promise<boolean>
        onChanged: (cb: (event: { dir: string; eventType: string; filename: string }) => void) => any
        offChanged: (handler?: any) => void
      }
      pty: {
        create: (id: string, cwd: string, cols?: number, rows?: number) => Promise<boolean>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, cb: (data: string) => void) => void
        onExit: (id: string, cb: () => void) => void
        removeListeners: (id: string) => void
      }
      shell: {
        openExternal: (url: string) => Promise<void>
        showItemInFolder: (fullPath: string) => Promise<void>
      }
      dialog: {
        openFolder: () => Promise<string | null>
      }
      db: {
        index:     (workspacePath: string) => Promise<DBStats>
        query:     (q: GhostedQuery)       => Promise<GhostedQueryResult>
        get:       (filePath: string)       => Promise<GhostedFile | null>
        stats:     ()                       => Promise<DBStats>
        onChange:  (cb: (stats: DBStats) => void) => void
        offChange: ()                       => void
      }
      pi: {
        create: (sessionId: string, cwd?: string) => Promise<{ ok: boolean; error?: string }>
        prompt: (sessionId: string, message: string) => Promise<{ ok: boolean; error?: string }>
        abort: (sessionId: string) => Promise<void>
        dispose: (sessionId: string) => Promise<void>
        onEvent: (sessionId: string, cb: (event: any) => void) => void
        removeListeners: (sessionId: string) => void
        onAction: (cb: (action: any) => void) => void
        offAction: () => void
      }
      git: {
        log: (cwd: string, count?: number) => Promise<{ hash: string; shortHash: string; author: string; email: string; date: string; subject: string; refs: string; parents: string[] }[]>
        diffSummary: (cwd: string) => Promise<{ diff: string; untracked: string }>
        status: (cwd: string) => Promise<{ x: string; y: string; path: string }[]>
        branch: (cwd: string) => Promise<string>
        stage: (cwd: string, path: string) => Promise<boolean>
        unstage: (cwd: string, path: string) => Promise<boolean>
        stageAll: (cwd: string) => Promise<boolean>
        commit: (cwd: string, message: string) => Promise<{ ok: boolean; error?: string }>
        aheadBehind: (cwd: string) => Promise<{ ahead: number; behind: number }>
        push: (cwd: string) => Promise<{ ok: boolean; error?: string }>
        pull: (cwd: string) => Promise<{ ok: boolean; error?: string }>
        discard: (cwd: string, path: string) => Promise<boolean>
        remote: (cwd: string) => Promise<{ owner: string; repo: string } | null>
        gh: (cwd: string, args: string) => Promise<{ ok: boolean; data?: string; error?: string }>
      }
    }
  }
}
