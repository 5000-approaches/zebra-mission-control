import type { McpServerConfig } from "./mcp-servers";

/**
 * Legacy MCP "SSE" transport (protocol 2024-11-05): the client opens a GET
 * event stream, the server announces a POST endpoint in an `endpoint` event,
 * every request is POSTed there and its reply arrives as a `message` event on
 * the stream. One short-lived session per call keeps this stateless.
 */

export type JsonRpcReply = { id?: unknown; result?: unknown; error?: unknown };
type SseEvent = { event: string; data: string };
type SseOptions = { timeoutMs?: number };

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_STREAM_BYTES = 1_048_576;
const PROTOCOL_VERSION = "2024-11-05";
const INIT_ID = 0;
const CLIENT_INFO = { name: "zebra-mission-control", version: "1" };
// Needed by localtunnel (loca.lt) hosts to skip their browser interstitial; harmless elsewhere.
const TUNNEL_HEADER = { "bypass-tunnel-reminder": "1" };

export function isSseServer(server: McpServerConfig): boolean {
  if (server.transport) return server.transport === "sse";
  try {
    return new URL(server.url).pathname.replace(/\/+$/, "").endsWith("/sse");
  } catch {
    return false;
  }
}

function authHeader(server: McpServerConfig): Record<string, string> {
  return server.key ? { [server.headerName]: server.key } : {};
}

function parseEvent(block: string): SseEvent | null {
  const lines = block.split(/\r?\n/);
  const event = lines.find((l) => l.startsWith("event:"))?.slice(6).trim() ?? "message";
  const data = lines.filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart());
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

/** Pull-based event reader over the response body; `next()` yields one parsed event. */
function eventReader(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  const pending: SseEvent[] = [];
  signal.addEventListener("abort", () => reader.cancel().catch(() => undefined), { once: true });

  async function next(): Promise<SseEvent | null> {
    while (pending.length === 0) {
      const { done, value } = await reader.read();
      if (done) return null;
      total += value.byteLength;
      if (total > MAX_STREAM_BYTES) throw new Error("MCP event stream exceeded 1 MB");
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const ev = parseEvent(block);
        if (ev) pending.push(ev);
      }
    }
    return pending.shift() ?? null;
  }

  return { next, close: () => reader.cancel().catch(() => undefined) };
}

function timeoutError(signal: AbortSignal, fallback: string): Error {
  return signal.aborted ? new Error("MCP SSE server timed out") : new Error(fallback);
}

async function waitForEndpoint(events: ReturnType<typeof eventReader>, base: string, signal: AbortSignal): Promise<string> {
  for (;;) {
    const ev = await events.next();
    if (!ev) throw timeoutError(signal, "MCP SSE server did not send an endpoint event");
    if (ev.event === "endpoint") return new URL(ev.data, base).toString();
  }
}

async function waitForReply(events: ReturnType<typeof eventReader>, id: number, signal: AbortSignal): Promise<JsonRpcReply> {
  for (;;) {
    const ev = await events.next();
    if (!ev) throw timeoutError(signal, `MCP SSE stream ended before replying to request ${id}`);
    if (ev.event !== "message") continue;
    try {
      const reply = JSON.parse(ev.data) as JsonRpcReply;
      if (reply.id === id) return reply;
    } catch {
      // Not JSON (keep-alive or unrelated payload) — keep waiting.
    }
  }
}

async function post(endpoint: string, server: McpServerConfig, payload: unknown, signal: AbortSignal): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", ...TUNNEL_HEADER, ...authHeader(server) },
    body: JSON.stringify(payload),
    redirect: "error",
    signal,
  });
  if (!res.ok) throw new Error(`MCP SSE POST failed: ${res.status} ${res.statusText}`);
}

export async function sseRpc(
  server: McpServerConfig,
  id: number,
  method: string,
  params: unknown,
  opts: SseOptions = {}
): Promise<JsonRpcReply> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const res = await fetch(server.url, {
    method: "GET",
    headers: { Accept: "text/event-stream", ...TUNNEL_HEADER, ...authHeader(server) },
    redirect: "error",
    signal,
  });
  if (!res.ok) throw new Error(`MCP SSE connect failed: ${res.status} ${res.statusText}`);
  if (!res.body) throw new Error("MCP SSE server returned no stream");

  const events = eventReader(res.body, signal);
  try {
    const endpoint = await waitForEndpoint(events, server.url, signal);
    await post(endpoint, server, {
      jsonrpc: "2.0",
      id: INIT_ID,
      method: "initialize",
      params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
    }, signal);
    await waitForReply(events, INIT_ID, signal);
    await post(endpoint, server, { jsonrpc: "2.0", method: "notifications/initialized" }, signal);
    await post(endpoint, server, { jsonrpc: "2.0", id, method, params }, signal);
    return await waitForReply(events, id, signal);
  } catch (err) {
    if (signal.aborted) throw new Error("MCP SSE server timed out");
    throw err;
  } finally {
    await events.close();
  }
}
