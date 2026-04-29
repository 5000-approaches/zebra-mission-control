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

function makeMonthResult(data: Record<string, unknown> = MONTH_DATA) {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

function makeGet(headers: Record<string, string> = {}, query = "") {
  return new Request(`http://localhost/api/forecast${query}`, { method: "GET", headers });
}

function mockSixMonths() {
  vi.mocked(callTool)
    .mockResolvedValueOnce(makeMonthResult({ ...MONTH_DATA, observed: 800000, projected: 800000 }))
    .mockResolvedValueOnce(makeMonthResult({ ...MONTH_DATA, observed: 700000, projected: 700000 }))
    .mockResolvedValueOnce(makeMonthResult({ ...MONTH_DATA, observed: 600000, projected: 600000 }))
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
  it("returns 200 with 6 months (3 historical + current + 2 future)", async () => {
    mockSixMonths();
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.months).toHaveLength(6);
    expect(json.months[0].observed).toBe(800000);
    expect(json.months[3].projected).toBe(240000);
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
    mockSixMonths();
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.totals.observed).toBe(800000 + 700000 + 600000 + 120000 + 0 + 0);
    expect(json.totals.projected).toBe(800000 + 700000 + 600000 + 240000 + 250000 + 260000);
    expect(json.totals.adjustments).toBe(5000 * 6);
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
    mockSixMonths();
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

  it("extracts numbers from alternative field names (revenue, forecastTotal)", async () => {
    vi.mocked(callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ revenue: 800000, forecastTotal: 950000 }) }],
    });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.months[0].observed).toBe(800000);
    expect(json.months[0].projected).toBe(950000);
  });

  it("unwraps payload nested under `data`", async () => {
    vi.mocked(callTool).mockResolvedValue({
      content: [{ type: "text", text: JSON.stringify({ data: { observed: 800000, projected: 1000000 } }) }],
    });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.months[0].observed).toBe(800000);
    expect(json.months[0].projected).toBe(1000000);
  });

  it("includes rawText only when ?debug=1 is set", async () => {
    mockSixMonths();
    const resPlain = await GET(makeGet());
    const plain = await resPlain.json();
    expect(plain.months[0].rawText).toBeUndefined();

    mockSixMonths();
    const resDebug = await GET(makeGet({}, "?debug=1"));
    const debug = await resDebug.json();
    expect(typeof debug.months[0].rawText).toBe("string");
    expect(debug.months[0].rawText).toContain("800000");
  });

  it("does not throw when MCP returns non-JSON text", async () => {
    vi.mocked(callTool).mockResolvedValue({
      content: [{ type: "text", text: "Projected total: 500,000 NOK" }],
    });
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.months[0].observed).toBe(0);
    expect(json.months[0].projected).toBe(0);
  });
});
