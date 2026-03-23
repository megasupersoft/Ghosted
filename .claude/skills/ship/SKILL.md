---
name: ship
description: Tag, push, and upload built artifacts from release/ to GitHub Releases. Strips AI attribution.
---

# /ship — Ghosted Ship

Takes whatever's already built in `release/` and ships it to GitHub Releases. Run `/build` first.

## Step 0 — Clean contributors

ALWAYS run this first. Strip any Co-Authored-By or AI attribution from ALL unpushed commits:

```bash
# Check for co-author lines in unpushed commits
git log --grep="Co-Authored-By" --oneline origin/main..HEAD
```

If any found, rewrite them:

```bash
git stash
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'grep -v "Co-Authored-By"' origin/main..HEAD
git update-ref -d refs/original/refs/heads/main 2>/dev/null
git stash pop 2>/dev/null
```

If co-author lines exist in PUSHED commits, rewrite the full range and force push:

```bash
git log --all --grep="Co-Authored-By" --oneline
# If any found on origin, identify the earliest one and rewrite from there
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'grep -v "Co-Authored-By"' <earliest>~1..HEAD
git push origin main --force-with-lease
```

NEVER add Co-Authored-By lines to commits. Ever.

## Step 1 — Preflight

```bash
git status
gh auth status
node -p "require('./package.json').version"
ls release/Ghosted-*
```

- Read version from `package.json` → `VERSION`
- If working tree is dirty → ask user: commit first or abort?
- If `gh` not authenticated → stop
- Find artifacts in `release/` matching the version (DMG, AppImage, exe)
- If no artifacts found → tell user to run `/build` first and stop

## Step 2 — Decide version

Check if `v<VERSION>` tag already exists on remote:

```bash
gh release view v<VERSION> 2>/dev/null
```

- If release exists → ask user: bump patch, or upload additional artifacts to existing release?
- If doesn't exist → proceed

If bumping, edit `package.json` version, commit:

```bash
git add package.json
git commit -m "chore(release): v<new_version>"
```

## Step 3 — Push, tag, release

Push first. If history was rewritten (step 0), use force:

```bash
git push origin main              # or --force-with-lease if rewritten
```

Delete any stale local/remote tags, then create fresh:

```bash
git tag -d v<VERSION> 2>/dev/null
gh api repos/megasupersoft/Ghosted/git/refs/tags/v<VERSION> -X DELETE 2>/dev/null
gh release delete v<VERSION> --yes 2>/dev/null
```

Create GitHub release with ALL matching artifacts. Use `gh release create` with `--target main` so it creates the tag on remote:

```bash
gh release create v<VERSION> release/Ghosted-*.dmg release/Ghosted-*.AppImage release/Ghosted*.exe \
  --title "Ghosted v<VERSION>" \
  --generate-notes \
  --latest \
  --target main
```

Only include artifact globs that actually match files. Print the release URL.

## Step 4 — Update GitHub Projects

```bash
gh project item-create 5 --owner megasupersoft --title "v<VERSION> shipped" --body "<summary>"
```

## Step 5 — Update PROGRESS.md

- Update version and date at top
- Move shipped items from "In Flight" to "Done"
