import { requireSession } from "@/lib/api-auth";
import { listServerTools } from "@/lib/mcp-client";
import { loadServers, mutateServers, toPublic, validateServerInput, type McpServerConfig } from "@/lib/mcp-servers";
import { catalogEnvKey } from "@/lib/tool-catalog";
import { deleteEnvValue } from "@/lib/vercel-env";
import { jsonError, readServerBody, type ServerBody } from "../route";

export const dynamic = "force-dynamic";
// Tool discovery + catalog generation can exceed the Vercel default function limit.
export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

function findEditable(servers: McpServerConfig[], id: string): McpServerConfig | Response {
  const server = servers.find((s) => s.id === id);
  if (!server) return jsonError("Server not found", 404);
  if (server.builtIn) return jsonError("The built-in PowerOffice server is managed under PowerOffice MCP settings", 400);
  return server;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** A stored key must never be re-sent to a different host than it was entered for. */
function movesKeyToNewOrigin(server: McpServerConfig, body: ServerBody): boolean {
  if (!server.key || body.url === undefined || body.key) return false;
  return originOf(body.url) !== originOf(server.url);
}

function mergeServer(server: McpServerConfig, body: ServerBody): McpServerConfig | Response {
  const validated = validateServerInput({
    name: body.name ?? server.name,
    url: body.url ?? server.url,
    key: body.key ? body.key : server.key,
    headerName: body.headerName ?? server.headerName,
    transport: body.transport ?? server.transport,
  });
  if (!validated.ok) return jsonError(validated.error, 400);
  return { ...server, ...validated.value };
}

export async function PATCH(req: Request, { params }: RouteContext): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const { id } = await params;
  const body = await readServerBody(req);
  if (body instanceof Response) return body;

  let failure: Response | null = null;
  let updated: McpServerConfig | null = null;
  try {
    await mutateServers((current) => {
      const server = findEditable(current, id);
      if (server instanceof Response) {
        failure = server;
        return current;
      }
      if (movesKeyToNewOrigin(server, body)) {
        failure = jsonError("Provide the API key again when changing the URL", 400);
        return current;
      }
      const merged = mergeServer(server, body);
      if (merged instanceof Response) {
        failure = merged;
        return current;
      }
      updated = merged;
      return current.map((s) => (s.id === id ? merged : s));
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
  if (failure) return failure;
  if (!updated) return jsonError("Server not found", 404);

  // Drop any cached tool list for the old URL/key; the next agent turn re-discovers.
  await listServerTools(updated, { fresh: true }).catch(() => undefined);
  return Response.json({ server: toPublic(updated) });
}

export async function DELETE(_req: Request, { params }: RouteContext): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const { id } = await params;
  const found = findEditable(await loadServers(), id);
  if (found instanceof Response) return found;

  try {
    await mutateServers((current) => current.filter((s) => s.id !== id));
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
  await deleteEnvValue(catalogEnvKey(id)).catch(() => undefined);
  return Response.json({ ok: true });
}
