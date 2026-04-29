import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ForecastApiResponse } from "@/app/api/forecast/route";

const mockSet = vi.fn();
let stateValues: [unknown, typeof mockSet][] = [];
let stateCallIdx = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
    useState: vi.fn((_init: unknown) => {
      const entry = stateValues[stateCallIdx] ?? [_init, mockSet];
      stateCallIdx++;
      return entry;
    }),
  };
});

// Traverses a React element tree; calls function components to get their output
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

import ForecastPage from "../page";

const MOCK_DATA: ForecastApiResponse = {
  months: [
    { month: "2026-01", observed: 800000, dailyAverage: 5000, projected: 800000, adjustments: 0, calculatedAt: "2026-04-29T10:00:00.000Z" },
    { month: "2026-02", observed: 850000, dailyAverage: 5000, projected: 850000, adjustments: 0, calculatedAt: "2026-04-29T10:00:00.000Z" },
    { month: "2026-03", observed: 900000, dailyAverage: 5000, projected: 900000, adjustments: 0, calculatedAt: "2026-04-29T10:00:00.000Z" },
    { month: "2026-04", observed: 100000, dailyAverage: 5000, projected: 200000, adjustments: 0, calculatedAt: "2026-04-29T10:00:00.000Z" },
    { month: "2026-05", observed: 0, dailyAverage: 5000, projected: 210000, adjustments: 120439, calculatedAt: "2026-04-29T10:00:00.000Z" },
    { month: "2026-06", observed: 0, dailyAverage: 5000, projected: 220000, adjustments: 120439, calculatedAt: "2026-04-29T10:00:00.000Z" },
  ],
  currentMonth: "2026-04",
  totals: { observed: 2650000, projected: 3280000, adjustments: 240878 },
};

function setStates(data: unknown, loading: boolean, error: unknown) {
  stateValues = [
    [data, mockSet],
    [loading, mockSet],
    [error, mockSet],
  ];
  stateCallIdx = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  stateCallIdx = 0;
});

describe("ForecastPage", () => {
  it("renders the Forecast heading", () => {
    setStates(null, true, null);
    const text = flatten(ForecastPage());
    expect(text).toContain("Forecast");
  });

  it("shows loading state", () => {
    setStates(null, true, null);
    const text = flatten(ForecastPage());
    expect(text).toContain("Loading");
  });

  it("renders 3 month cards with projected values when data is provided", () => {
    setStates(MOCK_DATA, false, null);
    const text = flatten(ForecastPage());
    expect(text).toContain("April 2026");
    expect(text).toContain("May 2026");
    expect(text).toContain("June 2026");
  });

  it("shows error banner on fetch failure", () => {
    setStates(null, false, "MCP call failed: connection refused");
    const text = flatten(ForecastPage());
    expect(text).toContain("MCP call failed");
  });

  it("shows current-month breakdown (earned + rest of month) and forecast-only label for future months", () => {
    setStates(MOCK_DATA, false, null);
    const text = flatten(ForecastPage());
    expect(text).toContain("Current month");
    expect(text).toContain("Earned to date");
    expect(text).toContain("Forecast — rest of month");
    expect(text).toContain("Not earned yet");
  });

  it("renders the explainer panel for daily run rate and adjustments", () => {
    setStates(MOCK_DATA, false, null);
    const text = flatten(ForecastPage());
    expect(text).toContain("How this forecast is built");
    expect(text).toContain("Daily run rate");
    expect(text).toContain("Forecast adjustments");
  });
});
