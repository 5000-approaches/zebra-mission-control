/**
 * PowerOffice-specific entry points used by the forecast route. PowerOffice is
 * an ordinary configurable MCP server; this module only decides which stored
 * server plays that role.
 */
import { listServerTools, callServerTool, _resetServerToolCache } from "./mcp-client";
import { loadServers, powerOfficeFromEnv, POWEROFFICE_ID, type McpServerConfig } from "./mcp-servers";

export type { McpTool, McpToolResult } from "./mcp-client";

export const FORECAST_TOOL = "forecast";
export const NO_POWEROFFICE_ERROR = "No PowerOffice MCP server configured — add one in Settings";

async function exposesForecast(server: McpServerConfig): Promise<boolean> {
  try {
    const tools = await listServerTools(server);
    return tools.some((t) => t.name === FORECAST_TOOL);
  } catch {
    return false;
  }
}

/**
 * Prefer the server with id "poweroffice", else the first stored server that
 * exposes a `forecast` tool, else the legacy env vars. Throws when none exists.
 */
export async function resolvePowerOfficeServer(): Promise<McpServerConfig> {
  const servers = await loadServers();
  const byId = servers.find((s) => s.id === POWEROFFICE_ID);
  if (byId) return byId;
  for (const server of servers) {
    if (await exposesForecast(server)) return server;
  }
  const fromEnv = powerOfficeFromEnv();
  if (fromEnv) return fromEnv;
  throw new Error(NO_POWEROFFICE_ERROR);
}

export async function listTools(opts: { fresh?: boolean } = {}) {
  return listServerTools(await resolvePowerOfficeServer(), opts);
}

export async function callTool(name: string, args: Record<string, unknown>) {
  return callServerTool(await resolvePowerOfficeServer(), name, args);
}

export function _resetToolCache() {
  _resetServerToolCache();
}
