import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ForecastApiResponse, ForecastMonth } from "@/app/api/forecast/route";

const mockSet = vi.fn();
let stateValues: [unknown, typeof mockSet][] = [];
let stateCallIdx = 0;
let lastEffect: (() => void | (() => void)) | null = null;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn((fn: () => void | (() => void)) => {
      lastEffect = fn;
    }),
    useState: vi.fn((init: unknown) => {
      const entry = stateValues[stateCallIdx] ?? [init, mockSet];
      stateCallIdx++;
      return entry;
    }),
  };
});

function flatten(node: unknown, depth = 0): string {
  if (depth > 30 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => flatten(n, depth)).join(" ");
  if (typeof node === "object" && node !== null) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      try {
        return flatten((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), depth + 1);
      } catch {
        return "";
      }
    }
    const children = (el.props as { children?: unknown } | undefined)?.children;
    return flatten(children, depth);
  }
  return "";
}

import AttentionPanel from "../AttentionPanel";

function setStates(data: ForecastApiResponse | null, loading: boolean, error: string | null) {
  stateValues = [
    [data, mockSet],
    [loading, mockSet],
    [error, mockSet],
  ];
  stateCallIdx = 0;
}

function makeMonth(partial: Partial<ForecastMonth> & { month: string }): ForecastMonth {
  return {
    month: partial.month,
    observed: partial.observed ?? 0,
    dailyAverage: partial.dailyAverage ?? 0,
    projected: partial.projected ?? 0,
    adjustments: partial.adjustments ?? 0,
    calculatedAt: partial.calculatedAt ?? "2026-04-29T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  stateCallIdx = 0;
  lastEffect = null;
});

describe("AttentionPanel render states", () => {
  it("shows the loading message while data is loading", () => {
    setStates(null, true, null);
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Loading signals");
  });

  it("shows the error message when fetch failed", () => {
    setStates(null, false, "Network down");
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Couldn");
    expect(text).toContain("Network down");
  });

  it("shows 'data loading' when no data and not loading and no error", () => {
    setStates(null, false, null);
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Forecast data is loading");
  });

  it("shows 'not enough history' when only current/future months", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-04", projected: 100000 }),
          makeMonth({ month: "2026-05", projected: 100000 }),
        ],
        totals: { observed: 0, projected: 200000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Not enough history");
  });

  it("shows 'all quiet' when past months exist but no signals trigger", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 800000 }),
          makeMonth({ month: "2026-02", observed: 800000 }),
          makeMonth({ month: "2026-03", observed: 800000 }),
          makeMonth({ month: "2026-04", projected: 800000 }),
          makeMonth({ month: "2026-05", projected: 800000 }),
        ],
        totals: { observed: 2400000, projected: 1600000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("All quiet");
  });

  it("always renders the future-signals section with FUTURE_ALERTS items", () => {
    setStates(null, true, null);
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Future signals");
    expect(text).toContain("Project over budget");
    expect(text).toContain("VIP customer needs a call");
    expect(text).toContain("Invoice overdue");
    expect(text).toContain("Employee under-utilized this week");
    expect(text).toContain("Hours not logged");
    expect(text).toContain("Sent quote awaiting response");
  });
});

describe("AttentionPanel alert derivation — forecast-unavailable", () => {
  it("surfaces the forecast-unavailable warning when current+future projected are all 0 with past data", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 800000 }),
          makeMonth({ month: "2026-02", observed: 850000 }),
          makeMonth({ month: "2026-03", observed: 900000 }),
          makeMonth({ month: "2026-04", projected: 0 }),
          makeMonth({ month: "2026-05", projected: 0 }),
        ],
        totals: { observed: 2550000, projected: 0, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Forecast data unavailable");
    expect(text).toContain("debug=1");
  });
});

describe("AttentionPanel alert derivation — declining-trend", () => {
  it("warns when last 3 past months trend down ≥10% from peak", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 1000000 }),
          makeMonth({ month: "2026-02", observed: 900000 }),
          makeMonth({ month: "2026-03", observed: 700000 }),
          makeMonth({ month: "2026-04", projected: 800000 }),
        ],
        totals: { observed: 2600000, projected: 800000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Revenue trending down");
    expect(text).toMatch(/1\.00M|1000K/);
  });

  it("does not warn when trend is flat", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 800000 }),
          makeMonth({ month: "2026-02", observed: 800000 }),
          makeMonth({ month: "2026-03", observed: 800000 }),
          makeMonth({ month: "2026-04", projected: 800000 }),
        ],
        totals: { observed: 2400000, projected: 800000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).not.toContain("Revenue trending down");
  });
});

describe("AttentionPanel alert derivation — current-month-low and next-month-thin", () => {
  it("warns when current month forecast is ≥15% below 3-month average", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 1000000 }),
          makeMonth({ month: "2026-02", observed: 1000000 }),
          makeMonth({ month: "2026-03", observed: 1000000 }),
          makeMonth({ month: "2026-04", projected: 700000 }),
          makeMonth({ month: "2026-05", projected: 1000000 }),
        ],
        totals: { observed: 3000000, projected: 1700000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Current month forecast");
    expect(text).toContain("below 3-month average");
  });

  it("warns when next month forecast is ≥20% below 3-month average", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 1000000 }),
          makeMonth({ month: "2026-02", observed: 1000000 }),
          makeMonth({ month: "2026-03", observed: 1000000 }),
          makeMonth({ month: "2026-04", projected: 1000000 }),
          makeMonth({ month: "2026-05", projected: 600000 }),
        ],
        totals: { observed: 3000000, projected: 1600000, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Pipeline thinning next month");
  });
});

describe("AttentionPanel alert derivation — large-adjustments", () => {
  it("info-flags when a future month has adjustments > 50,000 NOK", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 800000 }),
          makeMonth({ month: "2026-02", observed: 800000 }),
          makeMonth({ month: "2026-03", observed: 800000 }),
          makeMonth({ month: "2026-04", projected: 800000 }),
          makeMonth({ month: "2026-05", projected: 800000, adjustments: 120439 }),
        ],
        totals: { observed: 2400000, projected: 1600000, adjustments: 120439 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("Forecast adjustments are sizeable");
    expect(text).toMatch(/120K/);
  });
});

describe("AttentionPanel fetch effect", () => {
  function makeFetchResponse(payload: ForecastApiResponse, ok = true, status = 200) {
    return {
      ok,
      status,
      json: () => Promise.resolve(payload),
    };
  }

  const VALID_PAYLOAD: ForecastApiResponse = {
    currentMonth: "2026-04",
    months: [makeMonth({ month: "2026-04", projected: 100000 })],
    totals: { observed: 0, projected: 100000, adjustments: 0 },
  };

  it("fetches /api/forecast and stores the parsed JSON on success", async () => {
    setStates(null, true, null);
    const fetchSpy = vi.fn().mockResolvedValue(makeFetchResponse(VALID_PAYLOAD));
    vi.stubGlobal("fetch", fetchSpy);
    (AttentionPanel as () => unknown)();
    expect(typeof lastEffect).toBe("function");
    const cleanup = lastEffect!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchSpy).toHaveBeenCalledWith("/api/forecast");
    expect(mockSet).toHaveBeenCalledWith(VALID_PAYLOAD);
    expect(mockSet).toHaveBeenCalledWith(false);
    if (typeof cleanup === "function") cleanup();
    vi.unstubAllGlobals();
  });

  it("surfaces a non-2xx HTTP status as a string error", async () => {
    setStates(null, true, null);
    const fetchSpy = vi.fn().mockResolvedValue(makeFetchResponse(VALID_PAYLOAD, false, 503));
    vi.stubGlobal("fetch", fetchSpy);
    (AttentionPanel as () => unknown)();
    lastEffect!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSet).toHaveBeenCalledWith("HTTP 503");
    vi.unstubAllGlobals();
  });

  it("surfaces a network failure as the error message", async () => {
    setStates(null, true, null);
    const fetchSpy = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchSpy);
    (AttentionPanel as () => unknown)();
    lastEffect!();
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSet).toHaveBeenCalledWith("network down");
    vi.unstubAllGlobals();
  });

  it("does not write state after the cleanup function runs (cancelled)", async () => {
    setStates(null, true, null);
    let resolveFetch!: (v: ReturnType<typeof makeFetchResponse>) => void;
    const fetchPromise = new Promise<ReturnType<typeof makeFetchResponse>>((res) => {
      resolveFetch = res;
    });
    const fetchSpy = vi.fn().mockReturnValue(fetchPromise);
    vi.stubGlobal("fetch", fetchSpy);
    (AttentionPanel as () => unknown)();
    const cleanup = lastEffect!();
    if (typeof cleanup === "function") cleanup();
    resolveFetch(makeFetchResponse(VALID_PAYLOAD));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockSet).not.toHaveBeenCalledWith(VALID_PAYLOAD);
    expect(mockSet).not.toHaveBeenCalledWith(false);
    vi.unstubAllGlobals();
  });
});

describe("AttentionPanel formatting helpers via rendered output", () => {
  it("formats millions with M suffix when past average ≥ 1M", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 2_000_000 }),
          makeMonth({ month: "2026-02", observed: 2_000_000 }),
          makeMonth({ month: "2026-03", observed: 2_000_000 }),
          makeMonth({ month: "2026-04", projected: 0 }),
          makeMonth({ month: "2026-05", projected: 0 }),
        ],
        totals: { observed: 6_000_000, projected: 0, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toContain("2.00M");
  });

  it("formats sub-thousand as a plain integer", () => {
    setStates(
      {
        currentMonth: "2026-04",
        months: [
          makeMonth({ month: "2026-01", observed: 100 }),
          makeMonth({ month: "2026-02", observed: 100 }),
          makeMonth({ month: "2026-03", observed: 100 }),
          makeMonth({ month: "2026-04", projected: 0 }),
          makeMonth({ month: "2026-05", projected: 0 }),
        ],
        totals: { observed: 300, projected: 0, adjustments: 0 },
      },
      false,
      null,
    );
    const text = flatten((AttentionPanel as () => unknown)());
    expect(text).toMatch(/avg 100/);
  });
});
