import { describe, it, expect, vi, beforeEach } from "vitest";
import { callTool, listTools } from "@/lib/poweroffice-mcp";

vi.mock("@/lib/poweroffice-mcp", () => ({
  listTools: vi.fn().mockResolvedValue([
    { name: "forecast", description: "Get monthly forecast", inputSchema: { type: "object", properties: { month: { type: "string" } } } },
  ]),
  callTool: vi.fn(),
}));

import { GET } from "../route";

const MONTH_DATA = {
  observed: 120000,
  dailyAverage: 8000,
  projected: 240000,
  adjustments: 5000,
  calculatedAt: "2026-04-29T10:00:00.000Z",
};

function makeMonthResult(data = MONTH_DATA) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function makeGet(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/forecast", { method: "GET", headers });
}

function mockThreeMonths() {
  vi.mocked(callTool)
    .mockResolvedValueOnce(makeMonthResult())
    .mockResolvedValueOnce(makeMonthResult({ ...MONTH_DATA, observed: 0, projected: 250000 }))
    .mockResolvedValueOnce(makeMonthResult({ ...MONTH_DATA, observed: 0, projected: 260000 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTools).mockResolvedValue([
    { name: "forecast", description: "Get monthly forecast", inputSchema: {} },
  ]);
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://mcp.example.com");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "test-key");
  vi.stubEnv("FORECAST_API_SECRET", "");
});

describe("GET /api/forecast", () => {
  it("returns 200 with 3 months when forecast tool is available", async () => {
    mockThreeMonths();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.months).toHaveLength(3);
    expect(json.months[0].projected).toBe(240000);
  });

  it("returns 501 when forecast tool is not found", async () => {
    vi.mocked(listTools).mockResolvedValue([
      { name: "getOtherTool", description: "Something else", inputSchema: {} },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toContain("No forecast tool found");
    expect(json.error).toContain("getOtherTool");
  });

  it("returns correct totals summed across months", async () => {
    mockThreeMonths();
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.totals.observed).toBe(120000 + 0 + 0);
    expect(json.totals.projected).toBe(240000 + 250000 + 260000);
    expect(json.totals.adjustments).toBe(5000 + 5000 + 5000);
  });

  it("returns 401 when auth header is missing", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "secret123");
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns 401 when auth header is wrong", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "secret123");
    const res = await GET(makeGet({ "x-api-secret": "wrong" }));
    expect(res.status).toBe(401);
  });

  it("returns 200 when auth header is correct", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "secret123");
    mockThreeMonths();
    const res = await GET(makeGet({ "x-api-secret": "secret123" }));
    expect(res.status).toBe(200);
  });

  it("returns 502 when callTool throws", async () => {
    vi.mocked(callTool).mockRejectedValue(new Error("MCP unreachable"));
    const res = await GET(makeGet());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("MCP call failed");
  });

  it("returns 502 when listTools throws", async () => {
    vi.mocked(listTools).mockRejectedValue(new Error("connection refused"));
    const res = await GET(makeGet());
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toContain("MCP tools/list failed");
  });
});
