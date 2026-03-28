# /publish — Ghosted Site Deploy

Commits, pushes, builds, and deploys the docs site to Cloudflare Pages.

## Step 1 — Preflight

```bash
cd site && node --version
npx wrangler --version
npx wrangler whoami
```

- If wrangler not authenticated → tell user to run `! npx wrangler login`
- If Node < 18 → stop

## Step 2 — Commit & push

If there are uncommitted changes in `site/` or related files:

```bash
git add site/ .claude/skills/publish/
git commit -m "docs(site): update"
git push origin main
```

If clean, just push any unpushed commits. Always push — that's the whole point.

## Step 3 — Build

```bash
cd site && npm install && npm run docs:build
```

If build fails → stop and fix.

## Step 4 — Deploy

```bash
cd site && npx wrangler pages deploy .vitepress/dist --project-name=ghosted-site
```

If the project doesn't exist yet, wrangler will prompt to create it. Tell the user to run the deploy command manually the first time:

```
! cd site && npx wrangler pages deploy .vitepress/dist --project-name=ghosted-site
```

## Step 5 — Verify

Print the deployment URL and the production URL (ghosted.megasupersoft.com).
