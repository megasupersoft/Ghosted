# Ghosted 2.0

LLM-agnostic agent mission control on the Agent Client Protocol (ACP).

Ghosted 2.0 is a web-based interface and server that orchestrates autonomous agents over ACP, manages interactive sessions with permission gating, and visualizes the live execution graph in real-time. Run local agents deterministically in a sandbox or connect to cloud AI providers.

## Quickstart

```bash
npm install
npm run dev
```

Then open your browser:
- **Server** (WebSocket + ACP host): `ws://localhost:4821`
- **Web UI**: `http://localhost:4820`

Both start automatically with `npm run dev`. To point at a specific workspace instead of the default:

```bash
GHOSTED2_ROOT=/path/to/my/project npm run dev:server
```

## Available Agents

- **mock** — Deterministic demo agent (built-in, no installation needed). Runs arbitrary scripts in the workspace, requests permission for each tool, writes output to `.ghosted2-mock-output.md`.
- **claude** — Claude via `@agentclientprotocol/claude-agent-acp`. Requires `ANTHROPIC_API_KEY`.

Start a new session, send a prompt, grant permissions as the server relays them, and watch the agent execute.

## Architecture

- **Browser** — React UI, Zustand state, force-graph visualization, WebSocket client.
- **Server** (`:4821`) — Node.js ACP host, spawns agent subprocesses over stdio, relays session updates and permission requests to the UI via WebSocket.
- **Agents** — Subprocess child processes communicating with the server via ACP JSON-RPC (stdio).
- **Workspace** — All file operations confined to `GHOSTED2_ROOT` (enforced on the server side).
- **Wire protocol** — Defined in `shared/protocol.ts` (both browser and server import it); all messages are JSON.

## Commands

- `npm run dev` — Start server + web UI (concurrent, uses port 4820 and 4821)
- `npm run dev:server` — Server only (useful with `GHOSTED2_ROOT` override)
- `npm run dev:web` — Web UI only (if you're running the server elsewhere)
- `npm run typecheck` — TypeScript validation
- `npm run smoke` — End-to-end smoke test (spawns server, validates protocol flow)
- `npm run build` — Build web UI for production (output: `dist/`)

## Development Notes

- Server and web share `shared/protocol.ts` — the single source of truth for the WebSocket contract.
- New agents are spawned as child processes; each communicates via stdio.
- The `MOCK_FAST=1` environment variable makes the mock agent run instantly (used in smoke tests).
- No backend database — session state lives in memory; restart the server to reset.
