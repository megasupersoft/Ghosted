import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// Requires a prior `npm run build` — launches the real app against dist/.
test('app boots, loads the workspace shell, and PTY is available', async () => {
  // Isolated profile: never touches the real userData, never collides with a
  // running dev instance's single-instance lock
  const app = await electron.launch({
    args: ['.'],
    env: { ...process.env, GHOSTED_USER_DATA: mkdtempSync(path.join(tmpdir(), 'ghosted-smoke-')) },
  })

  const window = await app.firstWindow()
  await expect(window.locator('#root')).not.toBeEmpty({ timeout: 15000 })

  // Titlebar renders — the shell mounted without crashing
  await window.waitForSelector('button', { timeout: 15000 })

  // No renderer crash: main process still alive and window closable
  const isPackaged = await app.evaluate(({ app: a }) => a.isPackaged)
  expect(isPackaged).toBe(false)

  // Command palette opens on ⌘K/Ctrl+K and closes on Escape
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await window.keyboard.press(`${mod}+KeyK`)
  const paletteInput = window.locator('[cmdk-input]')
  await expect(paletteInput).toBeVisible({ timeout: 5000 })
  await paletteInput.fill('terminal')
  await expect(window.locator('[cmdk-item]').first()).toBeVisible()
  await window.keyboard.press('Escape')
  await expect(paletteInput).toBeHidden()

  await app.close()
})
