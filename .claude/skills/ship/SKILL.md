---
name: ship
description: Release pipeline for Ghosted. Version bump, build, tag, push, update GitHub Projects.
---

# /ship — Ghosted Release

Only run after `/review` passes with no CRITICAL or HIGH issues.

## Step 1 — Confirm
```bash
git status
git diff --stat main
npm run build
```
If build fails — stop.

## Step 2 — Version bump
Edit `package.json` version manually (no standard-version set up yet):
- Bug fix: patch (0.1.0 → 0.1.1)
- New feature: minor (0.1.0 → 0.2.0)
- Breaking change: major (0.1.0 → 1.0.0)

Then commit:
```bash
git add package.json
git commit -m "chore(release): <version>"
```

## Step 3 — Tag and push
```bash
git tag v<version>
git push origin main --follow-tags
```

## Step 4 — Update GitHub Projects
```bash
gh project item-list 5 --owner megasupersoft --format json
# Mark completed items done, create item for what shipped
gh project item-create 5 --owner megasupersoft --title "v<version> shipped" --body "<summary>"
```

## Step 5 — Update PROGRESS.md
- Move completed items from "In Flight" to "Done"
- Update version and date at top
- Note what's next

## BruceOS AppImage (when ready)
```bash
npm run build
npx electron-builder --linux AppImage
# Output: release/Ghosted-<version>.AppImage
```
