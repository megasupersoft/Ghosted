// Agent registry. Maps an agent id to the command that speaks ACP over stdio.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentInfo } from '../shared/protocol';

/** Directory of this module — ESM under tsx, CJS when bundled into Electron main. */
function moduleDir(): string {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return typeof __dirname === 'string' ? __dirname : process.cwd();
  }
}

/**
 * Repo root for the ghosted2 package (this file lives in <root>/server/).
 * When the host bundles this module somewhere else — Electron's dist-electron/
 * main bundle — the sibling layout no longer holds, so walk up looking for a
 * real ghosted2 checkout. GHOSTED2_DIR in the environment always wins.
 */
function resolveGhosted2Dir(): string {
  const fromEnv = process.env.GHOSTED2_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);

  const here = moduleDir();
  const candidates = [path.resolve(here, '..')];
  let dir = here;
  for (let i = 0; i < 6; i++) {
    candidates.push(path.join(dir, 'ghosted2'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'server', 'mock-agent.ts'))) return candidate;
  }
  return candidates[0];
}

export const GHOSTED2_DIR = resolveGhosted2Dir();

const TSX_BIN = path.join(GHOSTED2_DIR, 'node_modules/.bin/tsx');
const MOCK_AGENT = path.join(GHOSTED2_DIR, 'server/mock-agent.ts');

export interface AgentCommand {
  command: string;
  args: string[];
}

/** GHOSTED2_AGENT_CMD="my-agent --acp" registers a third agent under id 'custom'. */
function customCommand(): AgentCommand | null {
  const raw = process.env.GHOSTED2_AGENT_CMD?.trim();
  if (!raw) return null;
  const [command, ...args] = raw.split(/\s+/);
  if (!command) return null;
  return { command, args };
}

export function listAgents(): AgentInfo[] {
  const agents: AgentInfo[] = [
    {
      id: 'mock',
      name: 'Mock Agent',
      // Ships with the ghosted2 checkout only — a packaged desktop build has
      // neither the tsx runner nor the agent source.
      available: fs.existsSync(TSX_BIN) && fs.existsSync(MOCK_AGENT),
      description: 'Local scripted ACP agent — no network, no credentials.',
    },
    {
      id: 'claude',
      name: 'Claude Code',
      available: true,
      description: 'npx @agentclientprotocol/claude-agent-acp (resolved at spawn time).',
    },
  ];

  const custom = customCommand();
  if (custom) {
    agents.push({
      id: 'custom',
      name: 'Custom Agent',
      available: true,
      description: `GHOSTED2_AGENT_CMD: ${custom.command} ${custom.args.join(' ')}`.trim(),
    });
  }

  return agents;
}

export function resolveAgentCommand(id: string): AgentCommand | null {
  switch (id) {
    case 'mock':
      return { command: TSX_BIN, args: [MOCK_AGENT] };
    case 'claude':
      // Errors (missing package, missing auth) surface at spawn / initialize time.
      return { command: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp'] };
    case 'custom':
      return customCommand();
    default:
      return null;
  }
}
