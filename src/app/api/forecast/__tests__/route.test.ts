import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callTool, listTools, NO_POWEROFFICE_ERROR } from "@/lib/poweroffice-mcp";

vi.mock("@/lib/poweroffice-mcp", () => ({
  NO_POWEROFFICE_ERROR: "No PowerOffice MCP server configured — add one in Settings",
  listTools: vi.fn(),
  callTool: vi.fn(),
}));
vi.mock("@/lib/api-auth", () => ({ requireSessionOrApiSecret: vi.fn() }));

import { requireSessionOrApiSecret } from "@/lib/api-auth";
import { GET } from "../route";

const REAL_PAYLOAD_APRIL = {
  FromDate: "2026-04-01T00:00:00Z",
  ToDate: "2026-04-29T00:00:00Z",
  ForecastUntilDate: "2026-04-30T00:00:00Z",
  RuleName: "Public Holiday Adjustment",
  DailyAverage: 40146.44952380952,
  AnalysisPeriodTotal: 843075.44,
  AnalysisPeriodDays: 29,
  ProjectedTotal: 883221.8895238095,
  RemainingDays: 1,
  Notes: "Refined forecast from Hours Logged Forecast by adjusting for 0 working day public holidays. Reduced projected revenue by 0.00 NOK.",
  CalculatedAt: "2026-04-29T21:24:21.1830209+00:00",
};

const REAL_PAYLOAD_JAN = {
  FromDate: "2026-01-01T00:00:00Z",
  ToDate: "2026-01-31T00:00:00Z",
  ForecastUntilDate: "2026-04-29T00:00:00Z",
  AnalysisPeriodTotal: 1180950.39,
  AnalysisPeriodDays: 31,
  DailyAverage: 53679.56,
  ProjectedTotal: 4401724.18,
  Notes: "Reduced projected revenue by 161038.69 NOK.",
  CalculatedAt: "2026-04-29T21:25:58.2012254+00:00",
};

function mockResult(payload: Record<string, unknown>, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError,
  };
}

function makeGet(headers: Record<string, string> = {}, query = "") {
  return new Request(`http://localhost/api/forecast${query}`, { method: "GET", headers });
}

beforeEach(() => {
  // Pin "today" so month-window assertions (Jan past, Apr current, May/Jun future)
  // don't break when CI runs near a month boundary.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
  vi.clearAllMocks();
  vi.mocked(requireSessionOrApiSecret).mockResolvedValue(null);
  vi.mocked(listTools).mockResolvedValue([
    { name: "forecast", description: "forecast", inputSchema: {} },
  ]);
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://mcp.example.com");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "test-key");
  vi.stubEnv("FORECAST_API_SECRET", "");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/forecast", () => {
  it("returns 6 months and parses real PowerOffice MCP payload shape", async () => {
    // 6 calls in the order: Jan (past), Feb, Mar, Apr (current), May (future cum), Jun (future cum)
    vi.mocked(callTool)
      .mockResolvedValueOnce(mockResult({ ...REAL_PAYLOAD_JAN, AnalysisPeriodTotal: 1180950.39 }))
      .mockResolvedValueOnce(mockResult({ ...REAL_PAYLOAD_JAN, AnalysisPeriodTotal: 1244603.73 }))
      .mockResolvedValueOnce(mockResult({ ...REAL_PAYLOAD_JAN, AnalysisPeriodTotal: 993331.84 }))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL))
      .mockResolvedValueOnce(mockResult({ ...REAL_PAYLOAD_APRIL, ProjectedTotal: 1605857.98 }))
      .mockResolvedValueOnce(mockResult({ ...REAL_PAYLOAD_APRIL, ProjectedTotal: 2400000 }));

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.months).toHaveLength(6);
    expect(json.currentMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(json.currentMonth).toBe(json.months[3].month);
    // Past months: observed = AnalysisPeriodTotal; projected = observed.
    expect(json.months[0].observed).toBeCloseTo(1180950.39);
    expect(json.months[0].projected).toBeCloseTo(1180950.39);
    expect(json.months[1].observed).toBeCloseTo(1244603.73);
    expect(json.months[2].observed).toBeCloseTo(993331.84);
    // Current month (April): observed = MTD AnalysisPeriodTotal; projected = ProjectedTotal full month.
    expect(json.months[3].observed).toBeCloseTo(843075.44);
    expect(json.months[3].projected).toBeCloseTo(883221.89);
    // Future May: projected = cumThruMay - cumThruApr.
    expect(json.months[4].observed).toBe(0);
    expect(json.months[4].projected).toBeCloseTo(1605857.98 - 883221.89);
    // Future June: projected = cumThruJun - cumThruMay.
    expect(json.months[5].observed).toBe(0);
    expect(json.months[5].projected).toBeCloseTo(2400000 - 1605857.98);
  });

  it("issues correct args per kind: past uses month range + forecast_until=today; current/future use yesterday as to_date to avoid MCP error on today's not-yet-booked entries", async () => {
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    await GET(makeGet());

    const calls = vi.mocked(callTool).mock.calls;
    expect(calls).toHaveLength(6);

    // Past months: from_date = month-start, to_date = month-end, forecast_until_date = today (Oslo)
    const [, jan] = calls[0];
    // Dates go out as dd-MM-yyyy — the only format the PowerOffice MCP accepts.
    expect(jan).toMatchObject({ from_date: expect.stringMatching(/^01-01-\d{4}$/), to_date: expect.stringMatching(/^31-01-\d{4}$/) });

    // Current month: from_date = month-start, forecast_until_date = month-end.
    // to_date is yesterday (clamped to from_date on day 1) — never today.
    const [, current] = calls[3];
    expect(current.from_date).toMatch(/^01-/);
    expect(current.forecast_until_date).toMatch(/^(28|29|30|31)-/);
    expect(current.to_date).not.toBe(current.forecast_until_date);

    // Future months: from_date = current-month-start (cumulative); to_date = yesterday (matches current)
    const [, may] = calls[4];
    const [, jun] = calls[5];
    expect(may.from_date).toBe(current.from_date);
    expect(jun.from_date).toBe(current.from_date);
    expect(may.to_date).toBe(current.to_date);
    expect(jun.to_date).toBe(current.to_date);
    expect(may.forecast_until_date).not.toBe(jun.forecast_until_date);
  });

  it("extracts adjustment magnitude from the Notes string", async () => {
    vi.mocked(callTool).mockResolvedValue(
      mockResult({ ...REAL_PAYLOAD_APRIL, Notes: "Reduced projected revenue by 120,439.35 NOK." })
    );
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.months[3].adjustments).toBeCloseTo(120439.35);
  });

  it("returns 501 when forecast tool is not registered", async () => {
    vi.mocked(listTools).mockResolvedValue([
      { name: "getOtherTool", description: "x", inputSchema: {} },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toContain("No forecast tool found");
  });

  it("turns a throwing callTool into a per-month error instead of failing the whole response", async () => {
    vi.mocked(callTool)
      .mockRejectedValueOnce(new Error("MCP unreachable"))
      .mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.months[0].error).toContain("MCP unreachable");
    expect(json.months[0].projected).toBe(0);
    expect(json.months[1].observed).toBeCloseTo(843075.44);
  });

  it("does not log tool output", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    await GET(makeGet());
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("treats a non-string Notes field as zero adjustments instead of crashing", async () => {
    vi.mocked(callTool).mockResolvedValue(mockResult({ ...REAL_PAYLOAD_APRIL, Notes: { odd: true } }));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect((await res.json()).months[3].adjustments).toBe(0);
  });

  it("returns 502 when listTools throws", async () => {
    vi.mocked(listTools).mockRejectedValue(new Error("connection refused"));
    const res = await GET(makeGet());
    expect(res.status).toBe(502);
  });

  it("returns 501 with a friendly message when no PowerOffice server is configured", async () => {
    vi.mocked(listTools).mockRejectedValue(new Error(NO_POWEROFFICE_ERROR));
    const res = await GET(makeGet());
    expect(res.status).toBe(501);
    expect((await res.json()).error).toBe("No PowerOffice MCP server configured — add one in Settings");
  });

  it("zeroes a month when MCP returns isError for that slot, without crashing the whole response", async () => {
    vi.mocked(callTool)
      .mockResolvedValueOnce(mockResult({ AnalysisPeriodTotal: "An error occurred" }, true))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL))
      .mockResolvedValueOnce(mockResult(REAL_PAYLOAD_APRIL));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.months[0].observed).toBe(0);
    expect(json.months[0].projected).toBe(0);
    expect(typeof json.months[0].error).toBe("string");
  });

  it("surfaces a { Success: false, Error } envelope as a per-month error instead of silent zeros", async () => {
    const envelope = {
      Success: false,
      Result: null,
      Error: { Type: "ValidationError", Message: "Invalid date format or parameters", Details: "Invalid from_date format. Use dd-MM-yyyy (e.g., 15-05-2024)." },
    };
    vi.mocked(callTool).mockResolvedValue(mockResult(envelope));
    const res = await GET(makeGet());
    const json = await res.json();
    for (const m of json.months) {
      expect(m.observed).toBe(0);
      expect(m.projected).toBe(0);
      expect(m.error).toContain("Invalid date format or parameters");
      expect(m.error).toContain("Use dd-MM-yyyy");
    }
  });

  it("unwraps a { Success: true, Result } envelope", async () => {
    vi.mocked(callTool).mockResolvedValue(mockResult({ Success: true, Result: REAL_PAYLOAD_APRIL, Error: null }));
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.months[3].observed).toBeCloseTo(843075.44);
    expect(json.months[3].projected).toBeCloseTo(883221.89);
    expect(json.months[3].error).toBeUndefined();
  });

  it("on day 2 of the month skips current/future calls (from_date must be before to_date) and reports why", async () => {
    vi.setSystemTime(new Date("2026-09-02T12:00:00Z"));
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    // Only the 3 past months are fetched.
    expect(vi.mocked(callTool).mock.calls).toHaveLength(3);
    expect(json.currentMonth).toBe("2026-09");
    for (const m of json.months.slice(3)) {
      expect(m.observed).toBe(0);
      expect(m.projected).toBe(0);
      expect(m.error).toBe("Not enough booked days yet this month");
    }
  });

  it("includes rawText only when ?debug=1", async () => {
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    const plain = await (await GET(makeGet())).json();
    expect(plain.months[0].rawText).toBeUndefined();

    vi.clearAllMocks();
    vi.mocked(listTools).mockResolvedValue([{ name: "forecast", description: "forecast", inputSchema: {} }]);
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    const debug = await (await GET(makeGet({}, "?debug=1"))).json();
    expect(typeof debug.months[0].rawText).toBe("string");
    expect(debug.months[0].rawText).toContain("AnalysisPeriodTotal");
  });

  it("returns the 401 from requireSessionOrApiSecret without calling the MCP", async () => {
    vi.mocked(requireSessionOrApiSecret).mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    expect(listTools).not.toHaveBeenCalled();
  });

  it("hands the request to the auth helper so x-api-secret callers are accepted", async () => {
    vi.mocked(callTool).mockResolvedValue(mockResult(REAL_PAYLOAD_APRIL));
    const request = makeGet({ "x-api-secret": "secret123" });
    const res = await GET(request);
    expect(res.status).toBe(200);
    expect(requireSessionOrApiSecret).toHaveBeenCalledWith(request);
  });
});
