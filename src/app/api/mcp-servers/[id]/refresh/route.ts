import { requireSession } from "@/lib/api-auth";
import { loadServers } from "@/lib/mcp-servers";
import { discoverServer, jsonError } from "../../route";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteContext): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const { id } = await params;
  const server = (await loadServers()).find((s) => s.id === id);
  if (!server) return jsonError("Server not found", 404);

  const discovery = await discoverServer(server);
  return Response.json({ id, ...discovery });
}
