// Agent registry. Maps an agent id to the command that speaks ACP over stdio.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentInfo } from '../shared/protocol';

/** repo root for the ghosted2 package (this file lives in <root>/server/) */
export const GHOSTED2_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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
      available: true,
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
