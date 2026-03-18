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
        create: (id: string, cwd: string) => Promise<boolean>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, cb: (data: string) => void) => void
        onExit: (id: string, cb: () => void) => void
      }
      shell: {
        openExternal: (url: string) => Promise<void>
      }
    }
  }
}
