import { requireSession } from "@/lib/api-auth";
import { listServerTools } from "@/lib/mcp-client";
import {
  BUILT_IN_ID,
  loadServers,
  mutateServers,
  slugifyId,
  toPublic,
  validateServerInput,
  type McpServerConfig,
  type McpServerPublic,
} from "@/lib/mcp-servers";
import { generateCatalog } from "@/lib/tool-catalog";

export const dynamic = "force-dynamic";

export type ToolListItem = { name: string; description: string };
export type DiscoveryResult = { tools: ToolListItem[]; error?: string };

const BODY_FIELDS = ["name", "url", "key", "headerName"] as const;
export type ServerBody = Partial<Record<(typeof BODY_FIELDS)[number], string>>;

/** Discover a server's tools (fresh) and refresh its plain-language catalog. Never throws. */
export async function discoverServer(server: McpServerConfig): Promise<DiscoveryResult> {
  try {
    const tools = await listServerTools(server, { fresh: true });
    await generateCatalog(server, tools).catch(() => undefined);
    return { tools: tools.map((t) => ({ name: t.name, description: t.description })) };
  } catch (err) {
    return { tools: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Parse the JSON body and make sure every provided field is text. */
export async function readServerBody(req: Request): Promise<ServerBody | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }
  if (typeof raw !== "object" || raw === null) return jsonError("Body must be a JSON object", 400);
  const obj = raw as Record<string, unknown>;
  const body: ServerBody = {};
  for (const field of BODY_FIELDS) {
    const value = obj[field];
    if (value === undefined) continue;
    if (typeof value !== "string") return jsonError(`Field "${field}" must be text`, 400);
    body[field] = value;
  }
  return body;
}

export async function GET(): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;
  const servers = await loadServers();
  const body: { servers: McpServerPublic[] } = { servers: servers.map(toPublic) };
  return Response.json(body);
}

export async function POST(req: Request): Promise<Response> {
  const denied = await requireSession();
  if (denied) return denied;

  const body = await readServerBody(req);
  if (body instanceof Response) return body;

  const validated = validateServerInput({
    name: body.name ?? "",
    url: body.url ?? "",
    key: body.key ?? "",
    headerName: body.headerName,
  });
  if (!validated.ok) return jsonError(validated.error, 400);

  const id = slugifyId(validated.value.name);
  if (id === BUILT_IN_ID) return jsonError(`The id "${id}" is reserved for the built-in PowerOffice server`, 409);
  const server: McpServerConfig = { id, ...validated.value, builtIn: false };

  let duplicate = false;
  try {
    await mutateServers((current) => {
      if (current.some((s) => s.id === id)) {
        duplicate = true;
        return current;
      }
      return [...current, server];
    });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : String(err), 500);
  }
  if (duplicate) return jsonError(`A server with the id "${id}" already exists — choose another name`, 409);

  const discovery = await discoverServer(server);
  return Response.json({ server: toPublic(server), ...discovery }, { status: 201 });
}
