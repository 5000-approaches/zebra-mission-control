export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type McpToolResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

let cachedTools: McpTool[] | null = null;

function mcpUrl(): string {
  const url = process.env.POWEROFFICE_MCP_URL;
  if (!url) throw new Error("POWEROFFICE_MCP_URL is not set");
  return url;
}

function mcpKey(): string {
  const key = process.env.POWEROFFICE_MCP_KEY;
  if (!key) throw new Error("POWEROFFICE_MCP_KEY is not set");
  return key;
}

function mcpHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    "x-functions-key": mcpKey(),
  };
}

// MCP streamable-HTTP servers may reply with text/event-stream. Extract the
// JSON-RPC payload from `data:` lines; fall back to plain JSON.
async function readJsonRpc(res: Response): Promise<{ result?: unknown; error?: unknown }> {
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("text/event-stream")) {
    const dataLines = text
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) {
      throw new Error("MCP SSE response had no data line");
    }
    return JSON.parse(dataLines.join("\n"));
  }
  return JSON.parse(text);
}

export async function listTools(): Promise<McpTool[]> {
  if (cachedTools) return cachedTools;

  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers: mcpHeaders(),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

  if (!res.ok) {
    throw new Error(`MCP tools/list failed: ${res.status} ${res.statusText}`);
  }

  const data = await readJsonRpc(res);
  if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);

  const result = data.result as { tools?: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> } | undefined;
  const tools: McpTool[] = (result?.tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? {},
  }));

  cachedTools = tools;
  return tools;
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers: mcpHeaders(),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP tools/call failed: ${res.status} ${res.statusText}`);
  }

  const data = await readJsonRpc(res);
  if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);

  return data.result as McpToolResult;
}

export function _resetToolCache() {
  cachedTools = null;
}
