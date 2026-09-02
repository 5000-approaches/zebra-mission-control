import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/mcp-servers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp-servers")>("@/lib/mcp-servers");
  const loadServers = vi.fn();
  const saveServers = vi.fn();
  // Test double for the locked read-modify-write: apply the mutator to the mocked list and record the write.
  const mutateServers = vi.fn(async (mutator: (c: unknown[]) => unknown[]) => {
    const current = (await loadServers()) as unknown[];
    const next = mutator(current);
    if (next !== current) await saveServers(next);
    return next;
  });
  return { ...actual, loadServers, saveServers, mutateServers };
});
vi.mock("@/lib/mcp-client", () => ({ listServerTools: vi.fn() }));
vi.mock("@/lib/tool-catalog", () => ({ generateCatalog: vi.fn(), catalogEnvKey: (id: string) => `MCP_CATALOG_${id.toUpperCase()}` }));
vi.mock("@/lib/vercel-env", () => ({ deleteEnvValue: vi.fn() }));

import { requireSession } from "@/lib/api-auth";
import { loadServers, saveServers, type McpServerConfig } from "@/lib/mcp-servers";
import { listServerTools } from "@/lib/mcp-client";
import { generateCatalog } from "@/lib/tool-catalog";
import { deleteEnvValue } from "@/lib/vercel-env";
import { GET, POST } from "../route";
import { PATCH, DELETE } from "../[id]/route";
import { POST as REFRESH } from "../[id]/refresh/route";

const PO: McpServerConfig = { id: "poweroffice", name: "PowerOffice", url: "https://po", headerName: "x-functions-key", key: "po-key-1234" };
const HUB: McpServerConfig = { id: "hubspot", name: "HubSpot", url: "https://hub", headerName: "Authorization", key: "hub-key-5678" };

function req(method: string, body?: unknown) {
  return new Request("http://localhost/api/mcp-servers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(null);
  vi.mocked(loadServers).mockResolvedValue([PO, HUB]);
  vi.mocked(saveServers).mockResolvedValue(undefined);
  vi.mocked(listServerTools).mockResolvedValue([{ name: "deals", description: "List deals", inputSchema: {} }]);
  vi.mocked(generateCatalog).mockResolvedValue({ serverId: "x", generatedAt: "", toolNames: [], tools: [], howToCombine: "" });
  vi.mocked(deleteEnvValue).mockResolvedValue(undefined);
});

describe("auth", () => {
  it("every handler returns the 401 from requireSession", async () => {
    vi.mocked(requireSession).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET()).status).toBe(401);
    expect((await POST(req("POST", {}))).status).toBe(401);
    expect((await PATCH(req("PATCH", {}), params("hubspot"))).status).toBe(401);
    expect((await DELETE(req("DELETE"), params("hubspot"))).status).toBe(401);
    expect((await REFRESH(req("POST"), params("hubspot"))).status).toBe(401);
    expect(saveServers).not.toHaveBeenCalled();
  });
});

describe("GET /api/mcp-servers", () => {
  it("lists servers with masked keys", async () => {
    const body = await (await GET()).json();
    expect(body.servers).toHaveLength(2);
    expect(body.servers[0]).toEqual({ id: "poweroffice", name: "PowerOffice", url: "https://po", headerName: "x-functions-key", keyMasked: "••••1234" });
    expect(JSON.stringify(body)).not.toContain("po-key");
  });
});

describe("POST /api/mcp-servers", () => {
  it("validates, slugs the id, saves, discovers tools and returns 201", async () => {
    const res = await POST(req("POST", { name: "Sales CRM", url: "https://crm.example.com/mcp", key: "crm-key-9999" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.server).toMatchObject({ id: "sales-crm", name: "Sales CRM", headerName: "x-functions-key", keyMasked: "••••9999" });
    expect(body.server).not.toHaveProperty("builtIn");
    expect(body.tools).toEqual([{ name: "deals", description: "List deals" }]);
    expect(body.error).toBeUndefined();
    const saved = vi.mocked(saveServers).mock.calls[0][0];
    expect(saved.map((s) => s.id)).toEqual(["poweroffice", "hubspot", "sales-crm"]);
    expect(listServerTools).toHaveBeenCalledWith(expect.objectContaining({ id: "sales-crm", key: "crm-key-9999" }), { fresh: true });
    expect(generateCatalog).toHaveBeenCalled();
  });

  it("returns 400 on invalid input and invalid JSON", async () => {
    expect((await POST(req("POST", { name: "x", url: "http://insecure", key: "k" }))).status).toBe(400);
    const bad = new Request("http://localhost/api/mcp-servers", { method: "POST", body: "nope" });
    expect((await POST(bad)).status).toBe(400);
  });

  it("rejects duplicate ids, PowerOffice included", async () => {
    expect((await POST(req("POST", { name: "HubSpot", url: "https://a.example.com", key: "k" }))).status).toBe(409);
    expect((await POST(req("POST", { name: "PowerOffice", url: "https://a.example.com", key: "k" }))).status).toBe(409);
    expect(saveServers).not.toHaveBeenCalled();
  });

  it("still saves and returns 201 with error text when discovery fails", async () => {
    vi.mocked(listServerTools).mockRejectedValue(new Error("unreachable"));
    const res = await POST(req("POST", { name: "Other", url: "https://o.example.com", key: "k" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tools).toEqual([]);
    expect(body.error).toBe("unreachable");
    expect(saveServers).toHaveBeenCalled();
  });

  it("returns 500 when saving fails", async () => {
    vi.mocked(saveServers).mockRejectedValue(new Error("VERCEL_ADMIN_TOKEN is not set"));
    const res = await POST(req("POST", { name: "Other", url: "https://o.example.com", key: "k" }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("VERCEL_ADMIN_TOKEN");
  });

  it("returns 400 (not 500) when body fields are not strings", async () => {
    const res = await POST(req("POST", { name: 123, url: "https://o.example.com", key: "k" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/text/i);
  });

  it("lets a PowerOffice server be added again after it was removed (no reserved id)", async () => {
    vi.mocked(loadServers).mockResolvedValue([HUB]);
    const res = await POST(req("POST", { name: "PowerOffice", url: "https://a.example.com", key: "k" }));
    expect(res.status).toBe(201);
    expect((await res.json()).server).toMatchObject({ id: "poweroffice", name: "PowerOffice" });
    expect(saveServers).toHaveBeenCalled();
  });
});

describe("PATCH /api/mcp-servers/[id]", () => {
  it("updates the provided fields and keeps the key when empty", async () => {
    const res = await PATCH(req("PATCH", { name: "HubSpot CRM", key: "" }), params("hubspot"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.server).toMatchObject({ id: "hubspot", name: "HubSpot CRM", keyMasked: "••••5678" });
    const saved = vi.mocked(saveServers).mock.calls[0][0];
    expect(saved.find((s) => s.id === "hubspot")).toMatchObject({ name: "HubSpot CRM", key: "hub-key-5678", url: "https://hub" });
  });

  it("validates the merged result", async () => {
    expect((await PATCH(req("PATCH", { url: "ftp://x" }), params("hubspot"))).status).toBe(400);
  });

  it("edits PowerOffice like any other server and returns 404 for unknown servers", async () => {
    const res = await PATCH(req("PATCH", { name: "PowerOffice GO", url: "https://po/v2" }), params("poweroffice"));
    expect(res.status).toBe(200);
    expect((await res.json()).server).toMatchObject({ id: "poweroffice", name: "PowerOffice GO", url: "https://po/v2", keyMasked: "••••1234" });
    expect((await PATCH(req("PATCH", { name: "x" }), params("nope"))).status).toBe(404);
  });

  it("refuses to move the stored key to a new origin unless the key is supplied again", async () => {
    const res = await PATCH(req("PATCH", { url: "https://evil.example.com/collect" }), params("hubspot"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Provide the API key again");
    expect(saveServers).not.toHaveBeenCalled();

    const ok = await PATCH(req("PATCH", { url: "https://hub/other-path" }), params("hubspot"));
    expect(ok.status).toBe(200);
    const moved = await PATCH(req("PATCH", { url: "https://new.example.com/mcp", key: "fresh-key" }), params("hubspot"));
    expect(moved.status).toBe(200);
  });

  it("lets a server without a stored key change its URL freely", async () => {
    vi.mocked(loadServers).mockResolvedValue([PO, { ...HUB, key: "" }]);
    const res = await PATCH(req("PATCH", { url: "https://elsewhere.example.com/sse" }), params("hubspot"));
    expect(res.status).toBe(200);
    expect((await res.json()).server).toMatchObject({ url: "https://elsewhere.example.com/sse", keyMasked: "none" });
  });

  it("stores the transport on add and edit", async () => {
    const created = await POST(req("POST", { name: "Gurobot", url: "https://g.example.com/sse", key: "", transport: "sse" }));
    expect(created.status).toBe(201);
    expect((await created.json()).server).toMatchObject({ id: "gurobot", transport: "sse", keyMasked: "none" });
    const savedAdd = vi.mocked(saveServers).mock.calls[0][0];
    expect(savedAdd.find((s) => s.id === "gurobot")).toMatchObject({ transport: "sse", key: "" });

    vi.mocked(saveServers).mockClear();
    const edited = await PATCH(req("PATCH", { transport: "http" }), params("hubspot"));
    expect(edited.status).toBe(200);
    expect((await edited.json()).server).toMatchObject({ transport: "http" });
    expect((await PATCH(req("PATCH", { transport: "carrier-pigeon" }), params("hubspot"))).status).toBe(400);
  });

  it("refreshes the server's cached tools after a successful edit and ignores refresh failures", async () => {
    vi.mocked(listServerTools).mockRejectedValue(new Error("down"));
    const res = await PATCH(req("PATCH", { name: "Renamed" }), params("hubspot"));
    expect(res.status).toBe(200);
    expect(listServerTools).toHaveBeenCalledWith(expect.objectContaining({ id: "hubspot", name: "Renamed" }), { fresh: true });
  });

  it("returns 400 when body fields are not strings", async () => {
    expect((await PATCH(req("PATCH", { name: ["x"] }), params("hubspot"))).status).toBe(400);
  });
});

describe("DELETE /api/mcp-servers/[id]", () => {
  it("removes the server and its stored catalog", async () => {
    const res = await DELETE(req("DELETE"), params("hubspot"));
    expect(res.status).toBe(200);
    const saved = vi.mocked(saveServers).mock.calls[0][0];
    expect(saved.map((s) => s.id)).toEqual(["poweroffice"]);
    expect(deleteEnvValue).toHaveBeenCalledWith("MCP_CATALOG_HUBSPOT");
  });

  it("still succeeds when the catalog cleanup fails", async () => {
    vi.mocked(deleteEnvValue).mockRejectedValue(new Error("no token"));
    expect((await DELETE(req("DELETE"), params("hubspot"))).status).toBe(200);
  });

  it("removes PowerOffice like any other server and returns 404 for unknown servers", async () => {
    expect((await DELETE(req("DELETE"), params("poweroffice"))).status).toBe(200);
    const saved = vi.mocked(saveServers).mock.calls[0][0];
    expect(saved.map((s) => s.id)).toEqual(["hubspot"]);
    expect(deleteEnvValue).toHaveBeenCalledWith("MCP_CATALOG_POWEROFFICE");
    expect((await DELETE(req("DELETE"), params("nope"))).status).toBe(404);
  });
});

describe("POST /api/mcp-servers/[id]/refresh", () => {
  it("rediscovers tools fresh and regenerates the catalog", async () => {
    const res = await REFRESH(req("POST"), params("poweroffice"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: "poweroffice", tools: [{ name: "deals", description: "List deals" }] });
    expect(listServerTools).toHaveBeenCalledWith(PO, { fresh: true });
    expect(generateCatalog).toHaveBeenCalledWith(PO, expect.any(Array));
  });

  it("returns error text when discovery fails and 404 for unknown ids", async () => {
    vi.mocked(listServerTools).mockRejectedValue(new Error("down"));
    const body = await (await REFRESH(req("POST"), params("hubspot"))).json();
    expect(body).toEqual({ id: "hubspot", tools: [], error: "down" });
    expect((await REFRESH(req("POST"), params("nope"))).status).toBe(404);
  });
});
