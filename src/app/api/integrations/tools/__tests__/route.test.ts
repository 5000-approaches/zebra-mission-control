import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/mcp-registry", () => ({ listAllTools: vi.fn() }));
vi.mock("@/lib/mcp-servers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp-servers")>("@/lib/mcp-servers");
  return { ...actual, loadServers: vi.fn() };
});
vi.mock("@/lib/tool-catalog", () => ({ getCatalog: vi.fn() }));

import { requireSession } from "@/lib/api-auth";
import { listAllTools } from "@/lib/mcp-registry";
import { loadServers, type McpServerConfig } from "@/lib/mcp-servers";
import { getCatalog } from "@/lib/tool-catalog";
import { GET, type ToolsApiResponse } from "../route";

const PO: McpServerConfig = { id: "poweroffice", name: "PowerOffice", url: "https://po", headerName: "x", key: "k", builtIn: true };
const pub = { id: "poweroffice", name: "PowerOffice", url: "https://po", headerName: "x", builtIn: true, keyMasked: "••••" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(null);
  vi.mocked(loadServers).mockResolvedValue([PO]);
});

describe("GET /api/integrations/tools", () => {
  it("returns 401 without a session and never touches the servers", async () => {
    vi.mocked(requireSession).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listAllTools).not.toHaveBeenCalled();
  });

  it("returns each server's tools with plain-language catalog entries", async () => {
    vi.mocked(listAllTools).mockResolvedValue([
      { server: pub, tools: [{ name: "forecast", description: "Build a forecast", inputSchema: { type: "object" } }, { name: "list_invoices", description: "List invoices", inputSchema: {} }] },
    ]);
    vi.mocked(getCatalog).mockResolvedValue({
      serverId: "poweroffice",
      generatedAt: "now",
      toolNames: ["forecast", "list_invoices"],
      tools: [{ name: "forecast", friendlyName: "Revenue forecast", purpose: "Shows expected billing." }],
      howToCombine: "Combine them.",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ToolsApiResponse;

    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0]).toMatchObject({
      id: "poweroffice",
      label: "PowerOffice",
      howToCombine: "Combine them.",
      tools: [
        { name: "forecast", description: "Build a forecast", friendlyName: "Revenue forecast", purpose: "Shows expected billing." },
        { name: "list_invoices", description: "List invoices" },
      ],
    });
    expect((body.integrations[0].tools[0] as Record<string, unknown>).inputSchema).toBeUndefined();
    expect(body.integrations[0].error).toBeUndefined();
  });

  it("returns an error string for a failing server and no catalog lookup", async () => {
    vi.mocked(listAllTools).mockResolvedValue([{ server: pub, tools: [], error: "connection refused" }]);
    const body = (await (await GET()).json()) as ToolsApiResponse;
    expect(body.integrations[0].tools).toEqual([]);
    expect(body.integrations[0].error).toBe("connection refused");
    expect(getCatalog).not.toHaveBeenCalled();
  });

  it("still returns tools when the catalog lookup throws, and says why", async () => {
    vi.mocked(listAllTools).mockResolvedValue([{ server: pub, tools: [{ name: "a", description: "A.", inputSchema: {} }] }]);
    vi.mocked(getCatalog).mockRejectedValue(new Error("boom"));
    const body = (await (await GET()).json()) as ToolsApiResponse;
    expect(body.integrations[0].tools).toEqual([{ name: "a", description: "A." }]);
    expect(body.integrations[0].catalogError).toBe("boom");
  });

  it("exposes the catalog's generationError as catalogError while still listing fallback summaries", async () => {
    vi.mocked(listAllTools).mockResolvedValue([{ server: pub, tools: [{ name: "a", description: "A does things.", inputSchema: {} }] }]);
    vi.mocked(getCatalog).mockResolvedValue({
      serverId: "poweroffice",
      generatedAt: "",
      toolNames: ["a"],
      tools: [{ name: "a", friendlyName: "a", purpose: "A does things." }],
      howToCombine: "",
      generationError: "ANTHROPIC_API_KEY invalid",
    });
    const body = (await (await GET()).json()) as ToolsApiResponse;
    expect(body.integrations[0].catalogError).toBe("ANTHROPIC_API_KEY invalid");
    expect(body.integrations[0].tools[0]).toMatchObject({ friendlyName: "a", purpose: "A does things." });
    expect(body.integrations[0].howToCombine).toBeUndefined();
  });
});
