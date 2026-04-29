import { INTEGRATIONS } from "@/lib/mcp-integrations";
import type { McpTool } from "@/lib/poweroffice-mcp";

export const dynamic = "force-dynamic";

export type IntegrationTools = {
  id: string;
  label: string;
  tools: Pick<McpTool, "name" | "description">[];
  error?: string;
};

export type ToolsApiResponse = {
  integrations: IntegrationTools[];
};

export async function GET(): Promise<Response> {
  const integrations = await Promise.all(
    INTEGRATIONS.map(async (i): Promise<IntegrationTools> => {
      try {
        const tools = await i.loadTools();
        return {
          id: i.id,
          label: i.label,
          tools: tools.map((t) => ({ name: t.name, description: t.description })),
        };
      } catch (err) {
        return {
          id: i.id,
          label: i.label,
          tools: [],
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const body: ToolsApiResponse = { integrations };
  return Response.json(body);
}
