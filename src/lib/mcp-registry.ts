import type Anthropic from "@anthropic-ai/sdk";
import { loadServers, toPublic, type McpServerConfig, type McpServerPublic } from "./mcp-servers";
import { listServerTools, callServerTool, type McpTool, type McpToolResult } from "./mcp-client";

export type ServerTools = { server: McpServerPublic; tools: McpTool[]; error?: string };

const SEPARATOR = "__";

type LoadedServer = { config: McpServerConfig; tools: McpTool[]; error?: string };

async function loadAll(opts: { fresh?: boolean } = {}): Promise<LoadedServer[]> {
  const servers = await loadServers();
  return Promise.all(
    servers.map(async (config): Promise<LoadedServer> => {
      try {
        return { config, tools: await listServerTools(config, opts) };
      } catch (err) {
        return { config, tools: [], error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}

export async function listAllTools(opts: { fresh?: boolean } = {}): Promise<ServerTools[]> {
  const loaded = await loadAll(opts);
  return loaded.map(({ config, tools, error }) =>
    error === undefined ? { server: toPublic(config), tools } : { server: toPublic(config), tools, error }
  );
}

export function namespacedName(serverId: string, toolName: string): string {
  return `${serverId}${SEPARATOR}${toolName}`;
}

export function splitNamespacedName(name: string): { serverId: string; toolName: string } | null {
  const idx = name.indexOf(SEPARATOR);
  if (idx <= 0 || idx + SEPARATOR.length >= name.length) return null;
  return { serverId: name.slice(0, idx), toolName: name.slice(idx + SEPARATOR.length) };
}

export async function agentTools(): Promise<Anthropic.Tool[]> {
  const loaded = await loadAll();
  return loaded.flatMap(({ config, tools }) =>
    tools.map(
      (t): Anthropic.Tool => ({
        name: namespacedName(config.id, t.name),
        description: `[${config.name}] ${t.description}`,
        input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
      })
    )
  );
}

export async function callNamespacedTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const parts = splitNamespacedName(name);
  if (!parts) throw new Error(`Malformed tool name: ${name}`);
  const server = (await loadServers()).find((s) => s.id === parts.serverId);
  if (!server) throw new Error(`Unknown MCP server: ${parts.serverId}`);
  return callServerTool(server, parts.toolName, args);
}
