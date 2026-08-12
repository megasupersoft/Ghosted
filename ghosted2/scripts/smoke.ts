#!/usr/bin/env node
/**
 * Ghosted 2.0 smoke test — end-to-end protocol validation.
 * Spawns server, connects via WebSocket, exercises the ACP session flow.
 * Run via `npm run smoke`.
 */

import { spawn } from 'child_process';
import { accessSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { WebSocket } from 'ws';
import { WS_PORT } from '../shared/protocol.js';

type ClientMsg = { type: string; [k: string]: unknown };
type ServerMsg = { type: string; [k: string]: unknown };

const TIMEOUT_MS = 60_000;
const CONNECT_RETRY_MS = 250;
const CONNECT_MAX_MS = 15_000;

let tempDir: string | null = null;
let serverProcess: ReturnType<typeof spawn> | null = null;

const timeoutHandle = setTimeout(() => {
  console.error('SMOKE FAIL: Global 60s timeout exceeded');
  cleanup();
  process.exit(1);
}, TIMEOUT_MS);

async function cleanup() {
  clearTimeout(timeoutHandle);
  if (serverProcess) {
    // The server is spawned detached in its own process group; kill the whole
    // group so the tsx wrapper's grandchild node process can't survive as an
    // orphan holding the port.
    try {
      if (serverProcess.pid) process.kill(-serverProcess.pid, 'SIGTERM');
      else serverProcess.kill('SIGTERM');
    } catch {
      serverProcess.kill('SIGTERM');
    }
    await new Promise((resolve) => serverProcess?.once('exit', resolve));
  }
  if (tempDir) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  }
}

function waitFor(
  messages: ServerMsg[],
  predicate: (msg: ServerMsg) => boolean,
  timeoutMs: number,
  label: string,
  fromIndex = 0
): Promise<ServerMsg> {
  return new Promise((resolve, reject) => {
    const existing = messages.slice(fromIndex).find(predicate);
    if (existing) {
      return resolve(existing);
    }

    const handle = setInterval(() => {
      const found = messages.slice(fromIndex).find(predicate);
      if (found) {
        clearInterval(handle);
        resolve(found);
      }
    }, 50);

    setTimeout(() => {
      clearInterval(handle);
      reject(new Error(`Timeout waiting for "${label}"`));
    }, timeoutMs);
  });
}

async function main() {
  try {
    // 1. Create temp workspace
    tempDir = mkdtempSync(join(tmpdir(), 'ghosted2-smoke-'));
    writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'smoke-ws' }));
    console.log(`[smoke] Created temp workspace: ${tempDir}`);

    // 2. Spawn server
    const ghostedRoot = process.cwd();
    const serverArgs = [join(ghostedRoot, 'server/index.ts')];
    serverProcess = spawn('node', ['node_modules/.bin/tsx', ...serverArgs], {
      cwd: ghostedRoot,
      env: {
        ...process.env,
        GHOSTED2_ROOT: tempDir,
        MOCK_FAST: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true, // own process group, so cleanup can kill the whole tree
    });

    let serverStdout = '';
    let serverStderr = '';
    serverProcess.stdout?.on('data', (chunk) => {
      serverStdout += chunk.toString();
    });
    serverProcess.stderr?.on('data', (chunk) => {
      serverStderr += chunk.toString();
    });

    console.log(`[smoke] Spawned server (PID ${serverProcess.pid})`);

    // 3. Connect WebSocket with retry
    let ws: WebSocket | null = null;
    const connectDeadline = Date.now() + CONNECT_MAX_MS;
    while (!ws && Date.now() < connectDeadline) {
      try {
        ws = new WebSocket(`ws://localhost:${WS_PORT}`);
        await new Promise<void>((resolve, reject) => {
          ws!.once('open', () => resolve());
          ws!.once('error', reject);
          setTimeout(() => reject(new Error('Connect timeout')), CONNECT_RETRY_MS);
        });
        console.log(`[smoke] Connected to ws://localhost:${WS_PORT}`);
        break;
      } catch (e) {
        ws = null;
        await new Promise((r) => setTimeout(r, CONNECT_RETRY_MS));
      }
    }

    if (!ws) {
      throw new Error(`Failed to connect to ws://localhost:${WS_PORT} within 15s`);
    }

    // 4. Collect messages
    const messages: ServerMsg[] = [];
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ServerMsg;
        messages.push(msg);
      } catch (e) {
        // ignore parse errors
      }
    });

    // 5. Expect 'hello' and 'agents.list' with mock agent
    const hello = await waitFor(
      messages,
      (m) => m.type === 'hello',
      5000,
      'hello message'
    );
    console.log('[smoke] Received hello:', hello);

    const agentsListMsg = await waitFor(
      messages,
      (m) => m.type === 'agents.list',
      5000,
      'agents.list message'
    );
    const agents = (agentsListMsg as { agents?: unknown[] }).agents || [];
    const hasMock = agents.some((a: any) => a.id === 'mock');
    if (!hasMock) {
      throw new Error('Expected mock agent in agents.list');
    }
    console.log('[smoke] Confirmed mock agent in roster');

    // 6. Create session
    const createSessionMsg = { type: 'session.new', agentId: 'mock' };
    ws.send(JSON.stringify(createSessionMsg));
    const sessionCreated = await waitFor(
      messages,
      (m) => m.type === 'session.created',
      5000,
      'session.created'
    );
    const sessionId = (sessionCreated as { session?: { id?: string } }).session?.id;
    if (!sessionId) {
      throw new Error('No sessionId in session.created');
    }
    console.log(`[smoke] Created session: ${sessionId}`);

    // 7. Send prompt
    const promptMsg = { type: 'session.prompt', sessionId, text: 'run the demo' };
    ws.send(JSON.stringify(promptMsg));
    console.log('[smoke] Sent prompt');

    // 8. Expect permission request
    const permReq = await waitFor(
      messages,
      (m) => m.type === 'permission.request',
      10000,
      'permission.request'
    );
    const requestId = (permReq as { request?: { requestId?: string } }).request?.requestId;
    if (!requestId) {
      throw new Error('No requestId in permission.request');
    }
    console.log(`[smoke] Received permission request: ${requestId}`);

    // 9. Send permission decision
    const decisionMsg = {
      type: 'permission.decision',
      sessionId,
      requestId,
      optionId: 'allow',
    };
    // The session already broadcast an 'idle' status right after creation
    // (before the prompt turn), so only accept statuses received from here on.
    const afterDecisionIdx = messages.length;
    ws.send(JSON.stringify(decisionMsg));
    console.log('[smoke] Sent permission decision');

    // 10. Expect session.status idle/done (post-decision only)
    const statusMsg = await waitFor(
      messages,
      (m) =>
        m.type === 'session.status' &&
        (m as any).sessionId === sessionId &&
        ((m as any).status === 'idle' || (m as any).status === 'done'),
      15000,
      'session.status (idle or done)',
      afterDecisionIdx
    );
    console.log('[smoke] Session reached idle/done status:', statusMsg);

    // 11. Validate collected updates
    const agentMsgUpdate = messages.find(
      (m) =>
        m.type === 'session.update' &&
        (m as any).record?.update?.sessionUpdate === 'agent_message_chunk'
    );
    if (!agentMsgUpdate) {
      throw new Error('No session.update with agent_message_chunk found');
    }

    const toolCallUpdate = messages.find(
      (m) =>
        m.type === 'session.update' &&
        (m as any).record?.update?.sessionUpdate === 'tool_call'
    );
    if (!toolCallUpdate) {
      throw new Error('No session.update with tool_call found');
    }

    // 12. Check for mock output file
    const mockOutputPath = join(tempDir, '.ghosted2-mock-output.md');
    try {
      await new Promise<void>((resolve, reject) => {
        const checkFile = setInterval(() => {
          try {
            // Just check existence; we don't need to read it
            accessSync(mockOutputPath);
            clearInterval(checkFile);
            resolve();
          } catch (e) {
            // not yet
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkFile);
          reject(new Error('Mock output file not created'));
        }, 5000);
      });
    } catch (e) {
      throw new Error(`Expected file ${mockOutputPath} not found: ${(e as Error).message}`);
    }

    console.log('[smoke] SMOKE PASS');
    ws.close();
    await cleanup(); // process.exit skips finally blocks — clean up explicitly
    process.exit(0);
  } catch (err) {
    const label = (err as Error).message || String(err);
    console.error(`SMOKE FAIL: ${label}`);

    if (serverProcess) {
      const stdout = serverProcess.stdout?.read()?.toString() || '';
      const stderr = serverProcess.stderr?.read()?.toString() || '';
      if (stdout) console.error('--- SERVER STDOUT ---\n', stdout);
      if (stderr) console.error('--- SERVER STDERR ---\n', stderr);
    }

    await cleanup();
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error('Unhandled error:', err);
  await cleanup();
  process.exit(1);
});
