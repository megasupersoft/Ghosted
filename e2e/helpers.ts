import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export interface AppContext {
  app: ElectronApplication
  window: Page
  workspace: string
  userData: string
}

/**
 * Launch Ghosted with an isolated userData dir and a seeded temp workspace.
 * The workspace grant flows through the real workspace:restore migration path
 * (fresh userData has no granted-roots.json), same as a first launch.
 */
export async function launchWithWorkspace(): Promise<AppContext> {
  const userData = mkdtempSync(path.join(tmpdir(), 'ghosted-e2e-data-'))
  const workspace = mkdtempSync(path.join(tmpdir(), 'ghosted-e2e-ws-'))

  writeFileSync(
    path.join(workspace, 'notes.md'),
    '# Notes\n\nLinks to [[ideas]].\n\n- alpha\n- beta\n- gamma\n',
  )
  writeFileSync(path.join(workspace, 'ideas.md'), '# Ideas\n\nBack to [[notes]].\n')
  writeFileSync(path.join(workspace, 'hello.ts'), "export const hello = () => 'world'\n")
  writeFileSync(path.join(workspace, 'flow.canvas'), JSON.stringify({ nodes: [], edges: [] }))

  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GHOSTED_USER_DATA: userData },
  })
  const window = await app.firstWindow()
  await window.waitForSelector('.leaf-tab-bar', { timeout: 15000 })

  // Seed the workspace path the way a returning user has it, then reboot the
  // renderer so boot() runs the workspace:restore grant.
  await window.evaluate((ws) => localStorage.setItem('ghosted:workspacePath', ws), workspace)
  await window.reload()
  await window.waitForSelector('.leaf-tab-bar', { timeout: 15000 })

  return { app, window, workspace, userData }
}

export async function openPalette(window: Page) {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await window.keyboard.press(`${mod}+KeyK`)
  await window.waitForSelector('[cmdk-input]', { timeout: 5000 })
}

export async function runPaletteCommand(window: Page, query: string) {
  await openPalette(window)
  await window.locator('[cmdk-input]').fill(query)
  await window.waitForTimeout(200)
  await window.keyboard.press('Enter')
}
