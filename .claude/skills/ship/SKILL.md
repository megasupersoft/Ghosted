---
name: ship
description: Tag, push, and upload built artifacts from release/ to GitHub Releases.
---

# /ship — Ghosted Ship

Takes whatever's already built in `release/` and ships it to GitHub Releases. Run `/build` first.

## Step 1 — Preflight

```bash
git status
gh auth status
node -p "require('./package.json').version"
```

- Read version from `package.json` → `VERSION`
- If working tree is dirty → ask user: commit first or abort?
- If `gh` not authenticated → stop
- Find artifacts in `release/` matching the version (DMG, AppImage, exe)
- If no artifacts found → tell user to run `/build` first and stop

## Step 2 — Decide version

Check if `v<VERSION>` tag already exists:

```bash
git rev-parse v<VERSION> 2>/dev/null
```

- If tag exists → ask user: bump patch and re-tag, or upload to existing release?
- If tag doesn't exist → proceed

If bumping, edit `package.json` version, commit:

```bash
git add package.json
git commit -m "chore(release): v<new_version>"
```

## Step 3 — Push, tag, release

```bash
git push origin main
git tag v<VERSION>
git push origin v<VERSION>
```

Create GitHub release and attach ALL artifacts found in `release/`:

```bash
gh release create v<VERSION> release/Ghosted-<version>*.dmg release/Ghosted-<version>*.AppImage release/Ghosted*.exe \
  --title "Ghosted v<VERSION>" \
  --generate-notes \
  --latest
```

Only include artifact globs that actually match files. Print the release URL.

## Step 4 — Update GitHub Projects

```bash
gh project item-create 5 --owner megasupersoft --title "v<VERSION> shipped" --body "<summary>"
```

## Step 5 — Update PROGRESS.md

- Update version and date at top
- Move shipped items from "In Flight" to "Done"
