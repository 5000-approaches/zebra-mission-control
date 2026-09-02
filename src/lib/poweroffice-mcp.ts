/**
 * Thin wrapper around the generic MCP client for the built-in PowerOffice
 * server. Kept for the forecast route and existing callers.
 */
import { listServerTools, callServerTool, _resetServerToolCache } from "./mcp-client";
import { BUILT_IN_ID, DEFAULT_HEADER_NAME, type McpServerConfig } from "./mcp-servers";

export type { McpTool, McpToolResult } from "./mcp-client";

function builtInServer(): McpServerConfig {
  const url = process.env.POWEROFFICE_MCP_URL;
  if (!url) throw new Error("POWEROFFICE_MCP_URL is not set");
  const key = process.env.POWEROFFICE_MCP_KEY;
  if (!key) throw new Error("POWEROFFICE_MCP_KEY is not set");
  return { id: BUILT_IN_ID, name: "PowerOffice", url, headerName: DEFAULT_HEADER_NAME, key, builtIn: true };
}

export function listTools(opts: { fresh?: boolean } = {}) {
  return listServerTools(builtInServer(), opts);
}

export function callTool(name: string, args: Record<string, unknown>) {
  return callServerTool(builtInServer(), name, args);
}

export function _resetToolCache() {
  _resetServerToolCache();
}
