#!/usr/bin/env node
// Ghosted 2.0 — deterministic mock ACP agent.
//
// A standalone process that speaks the Agent Client Protocol over stdio, used
// to develop and test the UI without burning LLM tokens. Launched as:
//
//   npx tsx server/mock-agent.ts
//
// The host process connects to this with the ACP SDK's client-side connector
// (`acp.client(...)` / `ClientSideConnection`). This side implements the
// Agent role using the SDK's fluent `agent()` builder (the SDK's own
// dual-version example agent uses this same shape — see
// node_modules/@agentclientprotocol/sdk/dist/examples/agent.js).
//
// Every `session/prompt` runs the exact same scripted turn:
//   1. plan (3 entries, statuses evolve across 4 stages)
//   2. agent_thought_chunk
//   3. agent_message_chunk x3-4 (streamed)
//   4. tool_call "read-<n>" (kind: read) -> fs/read_text_file(package.json) -> tool_call_update
//   5. tool_call "write-<n>" (kind: edit) -> session/request_permission -> fs/write_text_file (if
//      allowed) -> tool_call_update
//   6. final agent_message_chunk, stopReason 'end_turn'
//
// `session/cancel` aborts the in-flight turn; the prompt handler then returns
// stopReason 'cancelled'.

import { randomUUID } from "node:crypto";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

// ---------- pacing ----------

/** 250ms by default so the UI/graph animates visibly; 5ms under MOCK_FAST=1 (smoke tests). */
const PACE_MS = process.env.MOCK_FAST === "1" ? 5 : 250;

/** Thrown internally when a turn is aborted via `session/cancel`. */
class TurnCancelledError extends Error {
  constructor() {
    super("turn cancelled");
    this.name = "TurnCancelledError";
  }
}

function sleep(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new TurnCancelledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, PACE_MS);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new TurnCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// ---------- session state ----------

interface MockSession {
  cwd: string;
  turnCount: number;
  abortController: AbortController | null;
}

const sessions = new Map<string, MockSession>();

// ---------- scripted turn ----------

const PLAN_LABELS = ["Scan workspace", "Read a file", "Write summary"] as const;

function planUpdate(
  statuses: readonly [acp.PlanEntryStatus, acp.PlanEntryStatus, acp.PlanEntryStatus],
): acp.SessionUpdate {
  return {
    sessionUpdate: "plan",
    entries: PLAN_LABELS.map((content, i) => ({
      content,
      status: statuses[i],
      priority: "medium" as const,
    })),
  };
}

async function runScriptedTurn(
  sessionId: string,
  cwd: string,
  turn: number,
  signal: AbortSignal,
  client: acp.AgentContext,
): Promise<void> {
  const notify = (update: acp.SessionUpdate) =>
    client.notify(acp.methods.client.session.update, { sessionId, update });

  // Stage 1 — scanning.
  await notify(planUpdate(["in_progress", "pending", "pending"]));
  await sleep(signal);

  await notify({
    sessionUpdate: "agent_thought_chunk",
    content: { type: "text", text: "Looking around the workspace…" },
  });
  await sleep(signal);

  const messageChunks = [
    "I'm scanning the workspace, ",
    "reading package.json, ",
    "and writing a short summary file ",
    "so you can see the round trip.",
  ];
  for (const chunk of messageChunks) {
    await notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: chunk } });
    await sleep(signal);
  }

  // Stage 2 — read tool call.
  await notify(planUpdate(["completed", "in_progress", "pending"]));
  await sleep(signal);

  const readId = `read-${turn}`;
  const packagePath = `${cwd}/package.json`;
  await notify({
    sessionUpdate: "tool_call",
    toolCallId: readId,
    kind: "read",
    title: "Read package.json",
    status: "in_progress",
    locations: [{ path: packagePath }],
  });
  await sleep(signal);

  try {
    const readResponse = await client.request(acp.methods.client.fs.readTextFile, {
      sessionId,
      path: packagePath,
    });
    const summary = readResponse.content.slice(0, 80);
    await notify({
      sessionUpdate: "tool_call_update",
      toolCallId: readId,
      status: "completed",
      content: [{ type: "content", content: { type: "text", text: summary } }],
    });
  } catch {
    await notify({ sessionUpdate: "tool_call_update", toolCallId: readId, status: "failed" });
  }
  await sleep(signal);

  // Stage 3 — write tool call, gated on permission.
  await notify(planUpdate(["completed", "completed", "in_progress"]));
  await sleep(signal);

  const writeId = `write-${turn}`;
  const outputPath = `${cwd}/.ghosted2-mock-output.md`;
  const writeTitle = "Write mock-output.md";
  const writeLocations = [{ path: outputPath }];

  await notify({
    sessionUpdate: "tool_call",
    toolCallId: writeId,
    title: writeTitle,
    kind: "edit",
    status: "pending",
    locations: writeLocations,
  });
  await sleep(signal);

  const permissionRequest: acp.RequestPermissionRequest = {
    sessionId,
    toolCall: {
      toolCallId: writeId,
      title: writeTitle,
      kind: "edit",
      status: "pending",
      locations: writeLocations,
    },
    options: [
      { optionId: "allow", name: "Allow", kind: "allow_once" },
      { optionId: "reject", name: "Reject", kind: "reject_once" },
    ],
  };
  const permissionResponse = await client.request(
    acp.methods.client.session.requestPermission,
    permissionRequest,
  );

  const outcome = permissionResponse.outcome;
  if (outcome.outcome === "selected" && outcome.optionId === "allow") {
    try {
      const content = `# Mock agent output\ntimestamp: ${new Date().toISOString()}\n`;
      await client.request(acp.methods.client.fs.writeTextFile, { sessionId, path: outputPath, content });
      await notify({ sessionUpdate: "tool_call_update", toolCallId: writeId, status: "completed" });
    } catch {
      await notify({ sessionUpdate: "tool_call_update", toolCallId: writeId, status: "failed" });
    }
  } else {
    // Rejected (or the permission request was itself cancelled).
    await notify({ sessionUpdate: "tool_call_update", toolCallId: writeId, status: "failed" });
    await sleep(signal);
    await notify({
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Understood — not writing." },
    });
  }
  await sleep(signal);

  // Stage 4 — wrap up.
  await notify(planUpdate(["completed", "completed", "completed"]));
  await sleep(signal);

  await notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Turn complete." } });
}

// ---------- ACP request/notification handlers ----------

async function handleInitialize(): Promise<acp.InitializeResponse> {
  return {
    protocolVersion: acp.PROTOCOL_VERSION,
    agentCapabilities: {
      loadSession: false,
      promptCapabilities: {},
    },
  };
}

async function handleNewSession(params: acp.NewSessionRequest): Promise<acp.NewSessionResponse> {
  const sessionId = randomUUID();
  sessions.set(sessionId, { cwd: params.cwd, turnCount: 0, abortController: null });
  return { sessionId };
}

async function handlePrompt(
  params: acp.PromptRequest,
  client: acp.AgentContext,
): Promise<acp.PromptResponse> {
  const session = sessions.get(params.sessionId);
  if (!session) {
    throw new Error(`Unknown session: ${params.sessionId}`);
  }

  // Only one turn in flight per session — cancel any prior one first.
  session.abortController?.abort();
  const controller = new AbortController();
  session.abortController = controller;
  session.turnCount += 1;
  const turn = session.turnCount;

  try {
    await runScriptedTurn(params.sessionId, session.cwd, turn, controller.signal, client);
  } catch (err) {
    if (err instanceof TurnCancelledError || controller.signal.aborted) {
      return { stopReason: "cancelled" };
    }
    throw err;
  } finally {
    if (session.abortController === controller) {
      session.abortController = null;
    }
  }

  return { stopReason: "end_turn" };
}

function handleCancel(params: acp.CancelNotification): void {
  sessions.get(params.sessionId)?.abortController?.abort();
}

// ---------- wire up stdio transport ----------

// Node's `stream/web` types and the DOM `lib` streams types used by the SDK's
// `Stream` shape are structurally near-identical but declared separately, so
// the interop point needs an explicit cast.
const stdout = Writable.toWeb(process.stdout) as unknown as WritableStream<Uint8Array>;
const stdin = Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>;
const stream = acp.ndJsonStream(stdout, stdin);

const connection = acp
  .agent({ name: "ghosted2-mock-agent" })
  .onRequest("initialize", () => handleInitialize())
  .onRequest("session/new", (ctx) => handleNewSession(ctx.params))
  .onRequest("session/prompt", (ctx) => handlePrompt(ctx.params, ctx.client))
  .onNotification("session/cancel", (ctx) => handleCancel(ctx.params))
  .connect(stream);

await connection.closed;
