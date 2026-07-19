import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  // Electron binaries cannot launch concurrently on Linux CI (ETXTBSY while
  // another worker holds the binary) — one app at a time.
  workers: 1,
})
