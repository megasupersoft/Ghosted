export {}

declare global {
  interface Window {
    electron: {
      fs: {
        readdir: (path: string) => Promise<{ name: string; path: string; isDirectory: boolean }[]>
        readfile: (path: string) => Promise<string>
        writefile: (path: string, content: string) => Promise<boolean>
        homedir: () => Promise<string>
      }
      pty: {
        create: (id: string, cwd: string, cols?: number, rows?: number) => Promise<boolean>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, cb: (data: string) => void) => void
        onExit: (id: string, cb: () => void) => void
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
      dialog: {
        openFolder: () => Promise<string | null>
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
        push: (cwd: string) => Promise<{ ok: boolean; error?: string }>
        pull: (cwd: string) => Promise<{ ok: boolean; error?: string }>
        discard: (cwd: string, path: string) => Promise<boolean>
        remote: (cwd: string) => Promise<{ owner: string; repo: string } | null>
        gh: (cwd: string, args: string) => Promise<{ ok: boolean; data?: string; error?: string }>
      }
    }
  }
}
