#!/usr/bin/env node
// afterPack: copy our known-good node-pty binaries from the project's node_modules
// into the packaged app, overwriting whatever electron-builder put there.
// This is necessary because electron-builder's npmRebuild produces incompatible
// spawn-helper binaries. See: https://github.com/microsoft/node-pty/issues/789

const fs = require('fs')
const path = require('path')

function findFiles(dir, names, results = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return results }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) findFiles(full, names, results)
    else if (names.includes(e.name)) results.push(full)
  }
  return results
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName
  const appOutDir = context.appOutDir

  let resourcesDir
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename
    resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources')
  } else {
    resourcesDir = path.join(appOutDir, 'resources')
  }

  const unpacked = path.join(resourcesDir, 'app.asar.unpacked')
  if (!fs.existsSync(unpacked)) return

  // Source: our project's node_modules (compiled by rebuild-pty.js for Electron)
  const projectRoot = path.resolve(__dirname, '..')
  const srcHelper = path.join(projectRoot, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper')
  const srcPty = path.join(projectRoot, 'node_modules', 'node-pty', 'build', 'Release', 'pty.node')

  console.log(`  afterPack: source spawn-helper ${fs.existsSync(srcHelper) ? fs.statSync(srcHelper).size + 'B' : 'MISSING'}`)
  console.log(`  afterPack: source pty.node ${fs.existsSync(srcPty) ? fs.statSync(srcPty).size + 'B' : 'MISSING'}`)

  // Overwrite ALL spawn-helper and pty.node in the packaged app
  const allHelpers = findFiles(unpacked, ['spawn-helper'])
  const allPty = findFiles(unpacked, ['pty.node'])

  for (const h of allHelpers) {
    if (fs.existsSync(srcHelper)) {
      fs.copyFileSync(srcHelper, h)
      console.log(`  afterPack: overwrote ${path.relative(appOutDir, h)} (${fs.statSync(h).size}B)`)
    }
    fs.chmodSync(h, 0o755)
  }

  for (const p of allPty) {
    // Only overwrite platform-matching binaries
    if (p.includes(`darwin-${process.arch}`) || p.includes('build/Release')) {
      if (fs.existsSync(srcPty)) {
        fs.copyFileSync(srcPty, p)
      }
    }
    fs.chmodSync(p, 0o755)
  }

  console.log(`  afterPack: replaced ${allHelpers.length} spawn-helpers, ${allPty.length} pty.node files`)
}
