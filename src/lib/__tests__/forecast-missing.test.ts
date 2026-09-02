import { describe, it, expect } from "vitest";
import { missingDataReasons } from "@/lib/forecast-missing";

const base = { observed: 0, dailyAverage: 0, projected: 0, adjustments: 0, calculatedAt: "2026-09-02T00:00:00Z" };

describe("missingDataReasons", () => {
  it("returns one labelled line per month that has an error, in order", () => {
    const reasons = missingDataReasons([
      { ...base, month: "2026-06", error: "Upstream failed" },
      { ...base, month: "2026-07", projected: 1000 },
      { ...base, month: "2026-09", error: "Not enough booked days yet this month" },
    ]);
    expect(reasons).toEqual([
      { month: "2026-06", label: "June 2026", error: "Upstream failed" },
      { month: "2026-09", label: "September 2026", error: "Not enough booked days yet this month" },
    ]);
  });

  it("returns an empty list when every month has data", () => {
    expect(missingDataReasons([{ ...base, month: "2026-07", projected: 1 }])).toEqual([]);
  });
});
