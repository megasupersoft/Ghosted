#!/usr/bin/env node
// afterSign hook for electron-builder
// Re-signs spawn-helper executables that electron-builder's signing step misses.
// electron-builder only signs .node/.dylib/.so — it skips standalone executables.
// macOS refuses to run adhoc-signed binaries inside a properly-signed .app bundle.
// See: https://github.com/microsoft/node-pty/issues/789

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function findFiles(dir, name, results = []) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return results }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) findFiles(full, name, results)
    else if (e.name === name) results.push(full)
  }
  return results
}

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appOutDir = context.appOutDir
  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)
  const unpacked = path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked')

  if (!fs.existsSync(unpacked)) return

  // Find the signing identity used for the app
  let identity
  try {
    const info = execSync(`codesign -dv "${appPath}" 2>&1`, { encoding: 'utf8' })
    const match = info.match(/Authority=(.+)/)
    if (match) identity = match[1]
  } catch {}

  const helpers = findFiles(unpacked, 'spawn-helper')
  if (helpers.length === 0) return

  for (const helper of helpers) {
    try {
      // Check current signature
      const sig = execSync(`codesign -dv "${helper}" 2>&1`, { encoding: 'utf8' })
      if (sig.includes('adhoc') || sig.includes('linker-signed')) {
        // Re-sign with the app's identity, or adhoc with hardened runtime
        if (identity) {
          execSync(`codesign --force --sign "${identity}" --timestamp "${helper}"`, { stdio: 'pipe' })
          console.log(`  afterSign: signed spawn-helper with "${identity}"`)
        } else {
          execSync(`codesign --force --sign - --options runtime "${helper}"`, { stdio: 'pipe' })
          console.log(`  afterSign: adhoc-signed spawn-helper with hardened runtime`)
        }
      }
    } catch (err) {
      console.error(`  afterSign: failed to sign ${helper}:`, err.message)
    }
  }

  // Re-sign the entire .app to update the seal (nested code was modified)
  try {
    if (identity) {
      execSync(`codesign --force --deep --sign "${identity}" --timestamp "${appPath}"`, { stdio: 'pipe' })
      console.log('  afterSign: re-sealed app bundle')
    }
  } catch (err) {
    console.error('  afterSign: re-seal failed:', err.message)
  }
}
