import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'

// `ghosted <dir>` hands the directory to the app as a CLI argument — the app
// must open it as the workspace with no prior localStorage or grant state.
test('launching with a directory argument opens it as the workspace', async () => {
  const userData = mkdtempSync(path.join(tmpdir(), 'ghosted-cli-data-'))
  const workspace = mkdtempSync(path.join(tmpdir(), 'ghosted-cli-ws-'))
  writeFileSync(path.join(workspace, 'from-cli.md'), '# Opened via CLI\n')

  const app = await electron.launch({
    args: ['.', workspace],
    env: { ...process.env, GHOSTED_USER_DATA: userData },
  })
  const window = await app.firstWindow()

  await expect(window.locator('.filetree-row', { hasText: 'from-cli.md' })).toBeVisible({
    timeout: 20000,
  })

  await app.close()
})
