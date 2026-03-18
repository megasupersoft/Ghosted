/**
 * GhostedDB — in-memory markdown index for Ghosted
 *
 * Runs in the Electron main process. Watches the workspace with chokidar,
 * parses frontmatter with gray-matter, extracts [[wikilinks]], and exposes
 * a query API over IPC.
 *
 * IPC channels:
 *   db:index   (invoke) → trigger full re-index of workspace
 *   db:query   (invoke) → query the index
 *   db:get     (invoke) → get a single file by path
 *   db:stats   (invoke) → index statistics
 *   db:changed (send)   → push update to renderer when index changes
 */

import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import chokidar, { FSWatcher } from 'chokidar'
import { BrowserWindow, ipcMain } from 'electron'

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  | { field: string; op: 'eq';       value: unknown  }
  | { field: string; op: 'neq';      value: unknown  }
  | { field: string; op: 'exists'                    }
  | { field: string; op: 'contains'; value: string   }
  | { field: string; op: 'gt';       value: number   }
  | { field: string; op: 'lt';       value: number   }

export interface GhostedQuery {
  where?:       QueryOp[]
  ext?:         string | string[]
  linkedTo?:    string
  linkedFrom?:  string
  contains?:    string
  limit?:       number
  offset?:      number
  orderBy?:     string
  orderDir?:    'asc' | 'desc'
}

export interface GhostedQueryResult {
  files: GhostedFile[]
  total: number
  took:  number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const IGNORED  = new Set(['node_modules','.git','dist','dist-electron','build','release','.next','.nuxt','coverage'])
const MD_EXTS  = new Set(['.md','.mdx','.markdown'])
const ALL_EXTS = new Set(['.md','.mdx','.markdown','.ts','.tsx','.js','.jsx','.py','.go','.rs','.txt'])
const WL_RE    = /\[\[([^\]|#]+?)(?:[|#][^\]]*)?\]\]/g

// ─── Index class ───────────────────────────────────────────────────────────────

class GhostedIndex {
  private files     = new Map<string, GhostedFile>()
  private nameIdx   = new Map<string, string>()   // lowercase name → absolute path
  private watcher:    FSWatcher | null = null
  private root       = ''
  private busy       = false

  async index(workspacePath: string): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.root = workspacePath
    this.files.clear()
    this.nameIdx.clear()
    if (this.watcher) { await this.watcher.close(); this.watcher = null }

    await this.scanDir(workspacePath)
    this.buildIncoming()
    this.busy = false
    this.watch(workspacePath)
  }

  private async scanDir(dir: string, depth = 0): Promise<void> {
    if (depth > 6) return
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.claude') continue
      if (IGNORED.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { await this.scanDir(full, depth + 1); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (ALL_EXTS.has(ext)) this.parseFile(full)
    }
  }

  private parseFile(filePath: string): void {
    try {
      const raw  = fs.readFileSync(filePath, 'utf-8')
      const stat = fs.statSync(filePath)
      const ext  = path.extname(filePath).toLowerCase()
      const name = path.basename(filePath, ext)

      let fm: Record<string, unknown> = {}
      let body = raw

      if (MD_EXTS.has(ext)) {
        try { const p = matter(raw); fm = p.data as Record<string,unknown>; body = p.content } catch {}
      }

      const wikilinks: string[] = []
      if (MD_EXTS.has(ext)) {
        WL_RE.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = WL_RE.exec(body)) !== null) wikilinks.push(m[1].trim())
      }

      const file: GhostedFile = {
        path: filePath, name, ext,
        relativePath: path.relative(this.root, filePath),
        frontmatter: fm, body, wikilinks,
        incomingLinks: [],
        mtime: stat.mtimeMs, size: stat.size,
      }
      this.files.set(filePath, file)
      this.nameIdx.set(name.toLowerCase(), filePath)
    } catch {}
  }

  private buildIncoming(): void {
    for (const f of this.files.values()) f.incomingLinks = []
    for (const f of this.files.values()) {
      for (const link of f.wikilinks) {
        const tp = this.nameIdx.get(link.toLowerCase())
        if (!tp) continue
        const t = this.files.get(tp)
        if (t && !t.incomingLinks.includes(f.path)) t.incomingLinks.push(f.path)
      }
    }
  }

  private watch(root: string): void {
    this.watcher = chokidar.watch(root, {
      ignored: (p: string) => p.split(path.sep).some(s => IGNORED.has(s) || (s.startsWith('.') && s !== '.claude')),
      persistent: true, ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    })
    const onChange = (fp: string) => {
      const ext = path.extname(fp).toLowerCase()
      if (!ALL_EXTS.has(ext)) return
      this.parseFile(fp); this.buildIncoming(); this.push()
    }
    const onRemove = (fp: string) => {
      this.files.delete(fp)
      this.nameIdx.clear()
      for (const [p, f] of this.files) this.nameIdx.set(f.name.toLowerCase(), p)
      this.buildIncoming(); this.push()
    }
    this.watcher.on('add', onChange).on('change', onChange).on('unlink', onRemove)
  }

  private push(): void {
    const s = this.stats()
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send('db:changed', s)
    }
  }

  // ── Query ──────────────────────────────────────────────────────────────────

  query(q: GhostedQuery): GhostedQueryResult {
    const t0 = Date.now()
    let r = Array.from(this.files.values())

    if (q.ext) {
      const exts = Array.isArray(q.ext) ? q.ext : [q.ext]
      r = r.filter(f => exts.includes(f.ext))
    }

    if (q.where) {
      for (const c of q.where) {
        r = r.filter(f => {
          const v = f.frontmatter[c.field]
          switch (c.op) {
            case 'eq':       return v === c.value
            case 'neq':      return v !== c.value
            case 'exists':   return v !== undefined && v !== null
            case 'contains': return typeof v === 'string' && v.toLowerCase().includes((c.value as string).toLowerCase())
            case 'gt':       return typeof v === 'number' && v > (c.value as number)
            case 'lt':       return typeof v === 'number' && v < (c.value as number)
          }
        })
      }
    }

    if (q.linkedTo) {
      const tp = this.resolve(q.linkedTo)
      r = r.filter(f => tp ? f.wikilinks.some(l => this.resolve(l) === tp) : false)
    }

    if (q.linkedFrom) {
      const sp = this.resolve(q.linkedFrom)
      r = r.filter(f => sp ? f.incomingLinks.includes(sp) : false)
    }

    if (q.contains) {
      const n = q.contains.toLowerCase()
      r = r.filter(f => f.body.toLowerCase().includes(n))
    }

    const ob  = q.orderBy ?? 'name'
    const dir = q.orderDir === 'desc' ? -1 : 1
    r.sort((a, b) => {
      const av = ob === 'name' ? a.name : ob === 'mtime' ? a.mtime : ob === 'size' ? a.size : a.frontmatter[ob]
      const bv = ob === 'name' ? b.name : ob === 'mtime' ? b.mtime : ob === 'size' ? b.size : b.frontmatter[ob]
      if (av == null && bv == null) return 0
      if (av == null) return 1; if (bv == null) return -1
      if (typeof av === 'string' && typeof bv === 'string') return dir * av.localeCompare(bv)
      if (typeof av === 'number' && typeof bv === 'number') return dir * (av - bv)
      return 0
    })

    const total  = r.length
    const offset = q.offset ?? 0
    const limit  = q.limit  ?? 200
    return { files: r.slice(offset, offset + limit), total, took: Date.now() - t0 }
  }

  get(filePath: string): GhostedFile | null {
    return this.files.get(filePath) ?? null
  }

  stats() {
    const byExt: Record<string, number> = {}
    let withFM = 0
    for (const f of this.files.values()) {
      byExt[f.ext] = (byExt[f.ext] ?? 0) + 1
      if (Object.keys(f.frontmatter).length > 0) withFM++
    }
    return { total: this.files.size, byExt, withFrontmatter: withFM, workspace: this.root }
  }

  private resolve(nameOrPath: string): string | null {
    if (nameOrPath.startsWith('/')) return this.files.has(nameOrPath) ? nameOrPath : null
    return this.nameIdx.get(nameOrPath.toLowerCase()) ?? null
  }

  async destroy(): Promise<void> {
    if (this.watcher) { await this.watcher.close(); this.watcher = null }
    this.files.clear(); this.nameIdx.clear()
  }
}

// ─── Singleton + IPC ──────────────────────────────────────────────────────────

const db = new GhostedIndex()

export function registerGhostedDB(): void {
  ipcMain.handle('db:index', async (_e, wp: string) => { await db.index(wp); return db.stats() })
  ipcMain.handle('db:query', (_e, q: GhostedQuery)  => db.query(q))
  ipcMain.handle('db:get',   (_e, p: string)         => db.get(p))
  ipcMain.handle('db:stats', ()                      => db.stats())
}

export { db }
