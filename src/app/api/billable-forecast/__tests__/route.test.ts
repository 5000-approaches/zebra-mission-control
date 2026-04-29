import { describe, it, expect, vi, beforeEach } from "vitest";
import { callTool, listTools } from "@/lib/poweroffice-mcp";

vi.mock("@/lib/poweroffice-mcp", () => ({
  listTools: vi.fn().mockResolvedValue([
    { name: "getEmployees", description: "List employees", inputSchema: {} },
    { name: "getProjects", description: "List projects", inputSchema: {} },
    { name: "getTimeEntries", description: "List time entries", inputSchema: {} },
  ]),
  callTool: vi.fn(),
}));

import { GET } from "../route";

const EMPLOYEES = [
  { id: "u1", name: "Alice" },
  { id: "u2", name: "Bob" },
];
const PROJECTS = [
  { id: "p1", name: "Alpha", customer: "Acme", department: "Dev" },
  { id: "p2", name: "Beta", customer: "Corp", department: "Design" },
];
const TIME_ENTRIES = [
  { userId: "u1", projectId: "p1", week: "2026-W18", hours: 10, rate: 1500, status: "committed" },
  { userId: "u2", projectId: "p2", week: "2026-W19", hours: 8, rate: 1200, status: "at-risk" },
];

function makeGet(params: Record<string, string> = {}, headers: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/billable-forecast");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString(), { method: "GET", headers });
}

function mockCallTool() {
  vi.mocked(callTool)
    .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(EMPLOYEES) }] })
    .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(PROJECTS) }] })
    .mockResolvedValueOnce({ content: [{ type: "text", text: JSON.stringify(TIME_ENTRIES) }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTools).mockResolvedValue([
    { name: "getEmployees", description: "List employees", inputSchema: {} },
    { name: "getProjects", description: "List projects", inputSchema: {} },
    { name: "getTimeEntries", description: "List time entries", inputSchema: {} },
  ]);
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://mcp.example.com");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "test-key");
});

describe("GET /api/billable-forecast", () => {
  it("returns 200 with rows, summary, and filters for empty params", async () => {
    mockCallTool();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rows).toHaveLength(2);
    expect(json.summary.totalHours).toBe(18);
    expect(json.summary.totalRevenue).toBe(10 * 1500 + 8 * 1200);
    expect(json.filters.users).toHaveLength(2);
    expect(json.filters.projects).toHaveLength(2);
  });

  it("propagates filter params to callTool arguments", async () => {
    mockCallTool();
    await GET(makeGet({ user: "u1", project: "p1", dateFrom: "2026-05-01", dateTo: "2026-05-31" }));
    expect(vi.mocked(callTool)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ user: "u1", project: "p1", dateFrom: "2026-05-01", dateTo: "2026-05-31" })
    );
  });

  it("returns at-risk revenue correctly in summary", async () => {
    mockCallTool();
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.summary.atRiskRevenue).toBe(8 * 1200);
  });

  it("returns 400 for invalid dateFrom format", async () => {
    const res = await GET(makeGet({ dateFrom: "not-a-date" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid dateTo format", async () => {
    const res = await GET(makeGet({ dateTo: "2026/05/01" }));
    expect(res.status).toBe(400);
  });

  it("returns 502 when MCP callTool throws", async () => {
    vi.mocked(callTool).mockRejectedValue(new Error("MCP exploded"));
    const res = await GET(makeGet());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("MCP exploded");
  });

  it("returns 502 when listTools throws", async () => {
    vi.mocked(listTools).mockRejectedValueOnce(new Error("list failed"));
    const res = await GET(makeGet());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("list failed");
  });

  it("returns 501 when no matching MCP tools found", async () => {
    vi.mocked(listTools).mockResolvedValueOnce([
      { name: "someTool", description: "irrelevant", inputSchema: {} },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toContain("No MCP tool found");
  });

  describe("auth guard", () => {
    it("returns 401 when secret set and header missing", async () => {
      vi.stubEnv("FORECAST_API_SECRET", "secret123");
      const res = await GET(makeGet());
      expect(res.status).toBe(401);
    });

    it("returns 401 when secret set and header wrong", async () => {
      vi.stubEnv("FORECAST_API_SECRET", "secret123");
      const res = await GET(makeGet({}, { "x-api-secret": "wrong" }));
      expect(res.status).toBe(401);
    });

    it("proceeds when secret set and header matches", async () => {
      vi.stubEnv("FORECAST_API_SECRET", "secret123");
      mockCallTool();
      const res = await GET(makeGet({}, { "x-api-secret": "secret123" }));
      expect(res.status).toBe(200);
    });
  });
});
