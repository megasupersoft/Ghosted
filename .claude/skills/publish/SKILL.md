# /publish — Ghosted Site Deploy

Builds the VitePress docs site and deploys to Cloudflare Pages. Pushes to main auto-deploy via Cloudflare git integration — use this for manual deploys.

## Step 1 — Preflight

```bash
cd site && node --version
npx wrangler --version
npx wrangler whoami
```

- If wrangler not authenticated → tell user to run `! npx wrangler login`
- If Node < 18 → stop

## Step 2 — Build

```bash
cd site && npm install && npm run docs:build
```

If build fails → stop and fix.

## Step 3 — Deploy

```bash
cd site && npx wrangler pages deploy .vitepress/dist --project-name=ghosted-site
```

If the project doesn't exist yet, wrangler will prompt to create it. Tell the user to run the deploy command manually the first time:

```
! cd site && npx wrangler pages deploy .vitepress/dist --project-name=ghosted-site
```

## Step 4 — Verify

Print the deployment URL. Tell the user to check it in the browser.
