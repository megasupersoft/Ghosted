# Contributing

## Development Setup

```bash
git clone https://github.com/megasupersoft/Ghosted.git
cd Ghosted
npm install
npm rebuild        # compile node-pty native module
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server (renderer only, no Electron) |
| `npm run preview` | Launch Electron with built dist |
| `npm run build` | Full build (tsc + vite) |
| `npm run lint` | ESLint |

## Key Rules

- **Never unmount panes.** Use `display:none` / `visibility:hidden` to hide them. This preserves terminal state and graph positions.
- **All filesystem access goes through IPC.** The renderer never imports Node APIs directly.
- **Always kill PTY on cleanup.** Every terminal instance must call `pty:kill` in its `useEffect` return — node-pty leaks are real.
- **Touch IPC = touch three files.** If you modify an IPC channel, update `electron/main.ts`, `electron/preload.ts`, and `src/types/electron.d.ts` together.
- **Rebuild after native changes.** After any `npm install` that touches native modules, run `npm rebuild`.

## Project Structure

```
electron/          Electron main process + preload
src/
  components/      Shared React components
  panes/           One directory per pane
  store/           Zustand store
  styles/          Global CSS + design tokens
  lib/             Utilities
  types/           TypeScript declarations
build/             Icons and build assets
scripts/           Build and packaging scripts
site/              Documentation website (VitePress)
```

## Submitting Changes

1. Fork the repo and create a branch
2. Make your changes
3. Run `npm run lint` and `npm run build`
4. Open a pull request against `main`
