---
name: ship
description: Release pipeline for Ghosted. Version bump, build, package, tag, push, GitHub release with artifact, update Projects.
---

# /ship — Ghosted Release

One-button release. Builds, packages, tags, pushes, uploads to GitHub Releases.

Only run after `/review` passes with no CRITICAL or HIGH issues.

## Step 1 — Preflight

Run all of these and STOP if anything fails:

```bash
git status
```

- If working tree is dirty, ask user: commit first or abort?
- Check `gh auth status` — must be authenticated

Read version from `package.json` → `VERSION`. Determine bump type:
- Ask user: **patch** (0.1.0 → 0.1.1), **minor** (0.1.0 → 0.2.0), or **major** (0.1.0 → 1.0.0)?
- If tag `v<new_version>` already exists → abort

## Step 2 — Version bump

Edit `package.json` version to the new version. Commit:

```bash
git add package.json
git commit -m "chore(release): v<new_version>"
```

## Step 3 — Build and package

```bash
npm run build
```

If build fails → stop, do not tag.

Then package for the current platform:
- macOS: `npx electron-builder --mac`
- Linux: `npx electron-builder --linux`

Expected artifacts:
- macOS arm64: `release/Ghosted-<version>-arm64.dmg`
- macOS x64: `release/Ghosted-<version>.dmg`
- Linux x64: `release/Ghosted-<version>.AppImage`
- Linux arm64: `release/Ghosted-<version>-arm64.AppImage`

Verify the artifact exists and print its size. If missing → stop.

## Step 4 — Tag, push, release

```bash
git push origin main
git tag v<new_version>
git push origin v<new_version>
```

Create GitHub release with the artifact attached:

```bash
gh release create v<new_version> <artifact_path> \
  --title "Ghosted v<new_version>" \
  --generate-notes \
  --latest
```

Print the release URL.

## Step 5 — Update GitHub Projects

```bash
gh project item-create 5 --owner megasupersoft --title "v<new_version> shipped" --body "<summary of what changed>"
```

## Step 6 — Update PROGRESS.md

- Update version at top (e.g., `v0.2.0`)
- Update date to today
- Move shipped items from "In Flight" to "Done"

## Important

- Version comes from `package.json` — single source of truth
- The `npm run release` script in `scripts/release.sh` does the same thing non-interactively for CI use
- Always build before tagging — never tag a broken build
- electron-builder must run on the target platform (can't build AppImage on macOS)
