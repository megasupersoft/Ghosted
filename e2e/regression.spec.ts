import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { type AppContext, launchWithWorkspace, openPalette, runPaletteCommand } from './helpers'

const SHOTS = process.env.E2E_SHOTS_DIR

test.describe.configure({ mode: 'serial' })

let ctx: AppContext

test.beforeAll(async () => {
  ctx = await launchWithWorkspace()
})

test.afterAll(async () => {
  await ctx?.app.close()
})

async function shot(name: string) {
  if (SHOTS) await ctx.window.screenshot({ path: path.join(SHOTS, `${name}.png`) })
}

test('workspace loads: explorer sidebar lists seeded files', async () => {
  const { window } = ctx
  await expect(window.locator('.filetree-row', { hasText: 'notes.md' })).toBeVisible({
    timeout: 15000,
  })
  await expect(window.locator('.filetree-row', { hasText: 'hello.ts' })).toBeVisible()
  await shot('01-explorer')
})

test('quick-open via ⌘K opens a file in Monaco', async () => {
  const { window } = ctx
  await openPalette(window)
  await window.locator('[cmdk-input]').fill('hello.ts')
  const item = window.locator('[cmdk-item]', { hasText: 'hello.ts' })
  await expect(item).toBeVisible({ timeout: 10000 })
  // Click rather than Enter — cmdk's selected row can shift during async
  // file-list re-renders on slow CI machines
  await item.click()

  await expect(window.locator('.leaf-pane-tab', { hasText: 'hello.ts' })).toBeVisible({
    timeout: 10000,
  })
  await expect(window.locator('.monaco-editor').first()).toBeVisible({ timeout: 20000 })
  await shot('02-editor')
})

test('edit + Cmd+S saves to disk and clears the dirty dot', async () => {
  const { window, workspace } = ctx
  await window.locator('.monaco-editor').first().click()
  await window.keyboard.press('End')
  await window.keyboard.type('// saved-by-e2e')
  await expect(window.locator('.editor-tab-dirty').first()).toBeVisible({ timeout: 5000 })

  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await window.keyboard.press(`${mod}+KeyS`)
  await expect(window.locator('.editor-tab-dirty')).toHaveCount(0, { timeout: 5000 })

  const onDisk = readFileSync(path.join(workspace, 'hello.ts'), 'utf-8')
  expect(onDisk).toContain('saved-by-e2e')
})

test('markdown preview renders with list bullets (preflight guard)', async () => {
  const { window } = ctx
  await window.locator('.filetree-row', { hasText: 'notes.md' }).click()
  await expect(window.locator('.leaf-pane-tab', { hasText: 'notes.md' })).toBeVisible({
    timeout: 10000,
  })
  // Preview toggle: Eye/Code button rendered for .md files
  await window.locator('button[title*="review"], button[title*="Preview"]').first().click()
  const preview = window.locator('.md-preview')
  await expect(preview).toBeVisible({ timeout: 5000 })
  await expect(preview.locator('li', { hasText: 'alpha' })).toBeVisible()
  const listStyle = await preview
    .locator('ul')
    .first()
    .evaluate((el) => getComputedStyle(el).listStyleType)
  expect(listStyle).toBe('disc')
  await shot('03-md-preview')
})

test('terminal pane mounts xterm and PTY round-trips a command', async () => {
  const { window } = ctx
  await runPaletteCommand(window, 'Open Terminal Pane')
  await expect(window.locator('.xterm').first()).toBeVisible({ timeout: 20000 })

  // Bridge-level PTY round-trip: real shell in the main process
  const output = await window.evaluate(async () => {
    const chunks: string[] = []
    const id = 'e2e-probe'
    window.electron.pty.onData(id, (d) => chunks.push(d))
    const res = await window.electron.pty.create(id, '', 80, 24)
    if (typeof res === 'object' && !res.ok) return `CREATE_FAILED: ${res.error}`
    await window.electron.pty.write(id, 'echo GHOSTED_E2E_$((20+3))\r')
    await new Promise((r) => setTimeout(r, 2500))
    await window.electron.pty.kill(id)
    window.electron.pty.removeListeners(id)
    return chunks.join('')
  })
  expect(output).toContain('GHOSTED_E2E_23')
  await shot('04-terminal')
})

test('graph pane renders the wikilink graph', async () => {
  const { window } = ctx
  await runPaletteCommand(window, 'Open Knowledge Graph Pane')
  await expect(window.getByText('Refresh')).toBeVisible({ timeout: 15000 })
  // Hidden panes stay mounted (pane pool), so scope to visible canvases only
  await expect(window.locator('canvas:visible').first()).toBeVisible({ timeout: 15000 })
  await window.waitForTimeout(1200)
  await shot('05-graph')
})

test('graph search focuses a node and depth limits the view', async () => {
  const { window } = ctx
  const search = window.locator('.graph-search')
  await expect(search).toBeVisible()
  const count = window.locator('.graph-count')
  await expect(count).toContainText('nodes')

  // Focus "notes" (linked to ideas; hello.ts and flow.canvas are unlinked)
  await search.fill('notes')
  await search.press('Enter')
  await window.locator('.graph-depth').selectOption('1')
  await expect(window.locator('.graph-root-chip')).toBeVisible()
  await expect(count).toContainText('2 /', { timeout: 5000 })
  await shot('05b-graph-depth')

  // Clearing the focus restores the full graph
  await window.locator('.graph-root-chip').click()
  await expect(count).not.toContainText('/', { timeout: 5000 })
  await search.fill('')
})

test('canvas pane mounts xyflow for a .canvas file', async () => {
  const { window } = ctx
  await window.locator('.filetree-row', { hasText: 'flow.canvas' }).click()
  await expect(window.locator('.react-flow').first()).toBeVisible({ timeout: 15000 })
  await expect(window.locator('.canvas-io-btn', { hasText: 'Export' })).toBeVisible()
  await expect(window.locator('.canvas-io-btn', { hasText: 'Import' })).toBeVisible()
  await shot('06-canvas')
})

test('kanban local board: create, keyboard select and move, persist', async () => {
  const { window, workspace } = ctx
  await runPaletteCommand(window, 'Open Kanban Pane')
  await expect(window.locator('.leaf-pane-tab', { hasText: 'Kanban' })).toBeVisible({
    timeout: 10000,
  })
  // Temp workspace has no git remote → local board mode
  await expect(window.locator('.kb-mode')).toHaveText('Local', { timeout: 15000 })

  const board = window.locator('.kb-wrap')
  await board.click()

  // C → create a card in the first column
  await window.keyboard.press('c')
  await window.locator('.kb-new-card').fill('Ship the roadmap')
  await window.keyboard.press('Enter')
  await window.keyboard.press('Escape')
  const card = window.locator('.kb-card', { hasText: 'Ship the roadmap' })
  await expect(card).toBeVisible()
  await shot('07-kanban')

  // Focus it (arrows), select (X), move via S → In Progress
  await board.click()
  await window.keyboard.press('ArrowRight')
  await window.keyboard.press('ArrowLeft')
  await expect(window.locator('.kb-card.focused')).toBeVisible()
  await window.keyboard.press('x')
  await expect(window.locator('.kb-card.selected')).toBeVisible()
  await window.keyboard.press('s')
  await window.locator('.kb-menu-item', { hasText: 'In Progress' }).click()
  const ipColumn = window.locator('.kb-col', { has: window.locator('.kb-col-header', { hasText: 'In Progress' }) })
  await expect(ipColumn.locator('.kb-card', { hasText: 'Ship the roadmap' })).toBeVisible()

  // Persisted to the workspace file
  await expect
    .poll(async () => {
      try {
        return readFileSync(path.join(workspace, '.ghosted/kanban.json'), 'utf-8')
      } catch {
        return ''
      }
    })
    .toContain('Ship the roadmap')
})

test('timeline pane: schedule an item and render its bar', async () => {
  const { window } = ctx
  await runPaletteCommand(window, 'Open Timeline Pane')
  await expect(window.locator('.leaf-pane-tab', { hasText: 'Timeline' })).toBeVisible({
    timeout: 10000,
  })
  await expect(window.locator('.tl-today')).toBeVisible()

  // The kanban card is unscheduled — schedule it from the tray
  const unscheduled = window.locator('.tl-unscheduled-item', { hasText: 'Ship the roadmap' })
  await expect(unscheduled).toBeVisible()
  await unscheduled.click()
  await expect(window.locator('.tl-bar', { hasText: 'Ship the roadmap' })).toBeVisible()
  await expect(window.locator('.tl-label', { hasText: 'Ship the roadmap' })).toBeVisible()
  await shot('09-timeline')
})

test('sidebar panel resizes by dragging the separator', async () => {
  const { window } = ctx
  const handle = window.locator('.ghost-resize-handle').first()
  await expect(handle).toBeVisible()
  const tree = window.locator('[id="ghosted-sidebar-nav"]')
  const before = (await tree.boundingBox())?.width ?? 0

  const hb = await handle.boundingBox()
  if (!hb) throw new Error('no handle box')
  await window.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await window.mouse.down()
  await window.mouse.move(hb.x + 120, hb.y + hb.height / 2, { steps: 8 })
  await window.mouse.up()

  const after = (await tree.boundingBox())?.width ?? 0
  expect(after).toBeGreaterThan(before + 60)
  await shot('08-resize')
})
