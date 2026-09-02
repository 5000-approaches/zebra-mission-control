import type { McpServerConfig } from "./mcp-servers";
import { isSseServer, sseRpc, type JsonRpcReply } from "./mcp-sse";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type CachedTools = { tools: McpTool[]; fetchedAt: number };
type Session = { id: string | null };

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_048_576;
const TOOL_CACHE_TTL_MS = 30_000;
const LIST_ID = 1;
const CALL_ID = 2;
const INIT_ID = 0;
const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "zebra-mission-control", version: "1" };
const SESSION_HEADER = "Mcp-Session-Id";
const NEEDS_INIT_PATTERN = /initializ|session/i;

const toolCache = new Map<string, CachedTools>();

function headersFor(server: McpServerConfig, session?: Session): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(server.key ? { [server.headerName]: server.key } : {}),
    ...(session?.id ? { [SESSION_HEADER]: session.id } : {}),
  };
}

function parseSseEvents(text: string): JsonRpcReply[] {
  return text
    .split(/\r?\n\r?\n/)
    .map((event) =>
      event
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n")
    )
    .filter((data) => data.length > 0)
    .flatMap((data) => {
      try {
        return [JSON.parse(data) as JsonRpcReply];
      } catch {
        return [];
      }
    });
}

async function readBody(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("MCP response too large (over 1 MB)");
  return text;
}

// MCP streamable-HTTP servers may reply with text/event-stream carrying one or
// more events. Pick the JSON-RPC reply for our request id; fall back to plain JSON.
export async function readJsonRpc(res: Response, expectedId?: number): Promise<JsonRpcReply> {
  const text = await readBody(res);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("text/event-stream")) return JSON.parse(text);

  const replies = parseSseEvents(text);
  if (replies.length === 0) throw new Error("MCP SSE response had no parsable data event");
  const matching = expectedId === undefined ? undefined : replies.find((r) => r.id === expectedId);
  return matching ?? replies[replies.length - 1];
}

type JsonRpcPayload = { jsonrpc: "2.0"; id?: number; method: string; params?: unknown };

async function postJsonRpc(server: McpServerConfig, payload: JsonRpcPayload, session?: Session): Promise<Response> {
  const res = await fetch(server.url, {
    method: "POST",
    headers: headersFor(server, session),
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MCP ${payload.method} failed: ${res.status} ${res.statusText}`);
  return res;
}

async function httpRpc(server: McpServerConfig, id: number, method: string, params: unknown, session?: Session): Promise<JsonRpcReply> {
  const res = await postJsonRpc(server, { jsonrpc: "2.0", id, method, params }, session);
  return readJsonRpc(res, id);
}

/** Some streamable-HTTP servers insist on an `initialize` handshake; returns the session to reuse. */
async function initializeHttp(server: McpServerConfig): Promise<Session> {
  const res = await postJsonRpc(server, {
    jsonrpc: "2.0",
    id: INIT_ID,
    method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
  });
  const session: Session = { id: res.headers.get(SESSION_HEADER) };
  await readJsonRpc(res, INIT_ID).catch(() => undefined);
  await postJsonRpc(server, { jsonrpc: "2.0", method: "notifications/initialized" }, session);
  return session;
}

function needsInitialize(reply: JsonRpcReply): boolean {
  return reply.error !== undefined && NEEDS_INIT_PATTERN.test(JSON.stringify(reply.error));
}

async function rpc(server: McpServerConfig, id: number, method: string, params: unknown): Promise<unknown> {
  if (isSseServer(server)) return unwrap(await sseRpc(server, id, method, params), method);

  const first = await httpRpc(server, id, method, params);
  if (!needsInitialize(first)) return unwrap(first, method);
  const session = await initializeHttp(server);
  return unwrap(await httpRpc(server, id, method, params, session), method);
}

function unwrap(reply: JsonRpcReply, method: string): unknown {
  if (reply.error) throw new Error(`MCP error (${method}): ${JSON.stringify(reply.error)}`);
  return reply.result;
}

function freshEnough(entry: CachedTools | undefined): entry is CachedTools {
  return entry !== undefined && Date.now() - entry.fetchedAt < TOOL_CACHE_TTL_MS;
}

export async function listServerTools(server: McpServerConfig, opts: { fresh?: boolean } = {}): Promise<McpTool[]> {
  const cached = toolCache.get(server.id);
  if (!opts.fresh && freshEnough(cached)) return cached.tools;

  const result = (await rpc(server, LIST_ID, "tools/list", {})) as
    | { tools?: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }> }
    | undefined;
  const tools: McpTool[] = (result?.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description ?? "",
    inputSchema: t.inputSchema ?? {},
  }));
  toolCache.set(server.id, { tools, fetchedAt: Date.now() });
  return tools;
}

export async function callServerTool(
  server: McpServerConfig,
  name: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  return (await rpc(server, CALL_ID, "tools/call", { name, arguments: args })) as McpToolResult;
}

export function _resetServerToolCache(): void {
  toolCache.clear();
}
