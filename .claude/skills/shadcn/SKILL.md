---
name: shadcn
description: Use when the user says "/shadcn <component>", "add a shadcn component", or asks for a dialog/menu/tooltip/popover-style UI element. Handles correct shadcn/ui installation for Ghosted's Vite + Tailwind 4 + Base UI setup.
---

# /shadcn — add a shadcn/ui component to Ghosted

## Installation

Always add via the CLI from the repo root (components.json is configured):

```bash
npx shadcn@latest add <component-name>
```

Never hand-write shadcn components — the CLI copies source into `src/components/ui/` with deps wired. Import from `@/components/ui/<component>`.

## Project specifics

- **Base UI** primitives (2026 default), not Radix — don't mix the two in one component.
- Theme tokens are already bridged: shadcn's `bg-popover`, `text-muted-foreground`, `border-border`, etc. resolve to Ghosted's palette via the `@theme inline` block in `src/styles/global.css`. Components should look native-dark with zero color tweaks — if one renders with light/wrong colors, the token bridge is missing an entry; add it there rather than editing the component.
- The app is dark-only for now; don't add `.dark`-conditional styling until the light-theme work lands.
- `cn()` lives at `@/lib/utils`.
- After adding: run `npm run lint:fix` (Biome will reformat the vendored file to repo style), then `npm run build`.
- The command palette is hand-rolled cmdk in `src/components/CommandPalette.tsx` — do NOT replace it with shadcn's `command` without being asked.

## Currently installed components

None yet — update this table as components land:

| Component | Where used |
|---|---|
