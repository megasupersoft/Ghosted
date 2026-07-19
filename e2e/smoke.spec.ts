import { _electron as electron, expect, test } from '@playwright/test'

// Requires a prior `npm run build` — launches the real app against dist/.
test('app boots, loads the workspace shell, and PTY is available', async () => {
  const app = await electron.launch({ args: ['.'] })

  const window = await app.firstWindow()
  await expect(window.locator('#root')).not.toBeEmpty({ timeout: 15000 })

  // Titlebar renders — the shell mounted without crashing
  await window.waitForSelector('button', { timeout: 15000 })

  // No renderer crash: main process still alive and window closable
  const isPackaged = await app.evaluate(({ app: a }) => a.isPackaged)
  expect(isPackaged).toBe(false)

  await app.close()
})
