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

export async function listTools(): Promise<McpTool[]> {
  if (cachedTools) return cachedTools;

  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-functions-key": mcpKey(),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });

  if (!res.ok) {
    throw new Error(`MCP tools/list failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);

  const tools: McpTool[] = (data.result?.tools ?? []).map(
    (t: { name: string; description: string; inputSchema: Record<string, unknown> }) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema ?? {},
    })
  );

  cachedTools = tools;
  return tools;
}

export async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const res = await fetch(mcpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-functions-key": mcpKey(),
    },
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

  const data = await res.json();
  if (data.error) throw new Error(`MCP error: ${JSON.stringify(data.error)}`);

  return data.result as McpToolResult;
}

export function _resetToolCache() {
  cachedTools = null;
}
