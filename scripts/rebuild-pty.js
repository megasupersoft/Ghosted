#!/usr/bin/env node
// Rebuild node-pty for Electron and copy to prebuilds
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const ptyDir = path.join(root, 'node_modules', 'node-pty')
const electronPkg = path.join(root, 'node_modules', 'electron', 'package.json')

if (!fs.existsSync(ptyDir) || !fs.existsSync(electronPkg)) {
  console.log('Skipping node-pty rebuild (deps not installed)')
  process.exit(0)
}

const electronVersion = JSON.parse(fs.readFileSync(electronPkg, 'utf8')).version
const platform = process.platform
const arch = process.arch

console.log(`Rebuilding node-pty for Electron ${electronVersion} (${platform}-${arch})...`)

try {
  execSync(
    `npx --yes node-gyp rebuild --target=${electronVersion} --arch=${arch} --dist-url=https://electronjs.org/headers --runtime=electron`,
    { cwd: ptyDir, stdio: 'inherit' }
  )

  // Copy to prebuilds so node-pty's loader finds it
  const src = path.join(ptyDir, 'build', 'Release', 'pty.node')
  const destDir = path.join(ptyDir, 'prebuilds', `${platform}-${arch}`)
  const dest = path.join(destDir, 'pty.node')

  if (fs.existsSync(src)) {
    fs.mkdirSync(destDir, { recursive: true })
    if (fs.existsSync(dest)) fs.unlinkSync(dest)
    fs.copyFileSync(src, dest)
    console.log(`Copied pty.node to ${destDir}`)
  }

  console.log('node-pty rebuild complete')
} catch (e) {
  console.error('node-pty rebuild failed:', e.message)
}
