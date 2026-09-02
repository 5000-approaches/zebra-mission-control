import { requireSession } from "@/lib/api-auth";
import { listAllTools } from "@/lib/mcp-registry";
import { loadServers } from "@/lib/mcp-servers";
import { getCatalog, type ServerCatalog } from "@/lib/tool-catalog";
import type { McpTool } from "@/lib/mcp-client";

export const dynamic = "force-dynamic";

export type IntegrationTool = {
  name: string;
  description: string;
  /** Plain-language name from the catalog, when available. */
  friendlyName?: string;
  /** One-sentence layman's explanation from the catalog, when available. */
  purpose?: string;
};

export type IntegrationTools = {
  id: string;
  label: string;
  tools: IntegrationTool[];
  howToCombine?: string;
  error?: string;
};

export type ToolsApiResponse = {
  integrations: IntegrationTools[];
};

function withCatalog(tools: McpTool[], catalog: ServerCatalog | null): IntegrationTool[] {
  const byName = new Map((catalog?.tools ?? []).map((t) => [t.name, t]));
  return tools.map((t) => {
    const summary = byName.get(t.name);
    return summary
      ? { name: t.name, description: t.description, friendlyName: summary.friendlyName, purpose: summary.purpose }
      : { name: t.name, description: t.description };
  });
}

export async function GET(): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const [servers, listed] = await Promise.all([loadServers(), listAllTools()]);
  const configById = new Map(servers.map((s) => [s.id, s]));

  const integrations = await Promise.all(
    listed.map(async ({ server, tools, error }): Promise<IntegrationTools> => {
      if (error !== undefined) return { id: server.id, label: server.name, tools: [], error };
      const config = configById.get(server.id);
      const catalog = config ? await getCatalog(config, tools).catch(() => null) : null;
      const base: IntegrationTools = { id: server.id, label: server.name, tools: withCatalog(tools, catalog) };
      return catalog?.howToCombine ? { ...base, howToCombine: catalog.howToCombine } : base;
    })
  );

  const body: ToolsApiResponse = { integrations };
  return Response.json(body);
}
