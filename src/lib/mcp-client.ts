import type { McpServerConfig } from "./mcp-servers";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type JsonRpcReply = { id?: unknown; result?: unknown; error?: unknown };
type CachedTools = { tools: McpTool[]; fetchedAt: number };

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 1_048_576;
const TOOL_CACHE_TTL_MS = 30_000;
const LIST_ID = 1;
const CALL_ID = 2;

const toolCache = new Map<string, CachedTools>();

function headersFor(server: McpServerConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    [server.headerName]: server.key,
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

async function rpc(server: McpServerConfig, id: number, method: string, params: unknown): Promise<unknown> {
  const res = await fetch(server.url, {
    method: "POST",
    headers: headersFor(server),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status} ${res.statusText}`);
  const data = await readJsonRpc(res, id);
  if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);
  return data.result;
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
