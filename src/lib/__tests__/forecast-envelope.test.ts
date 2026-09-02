import { describe, it, expect } from "vitest";
import { parseForecastEnvelope } from "@/lib/forecast-envelope";

const FLAT = { AnalysisPeriodTotal: 100, ProjectedTotal: 200, DailyAverage: 10, Notes: "n", CalculatedAt: "2026-04-29T21:24:21Z" };

describe("parseForecastEnvelope", () => {
  it("accepts the legacy flat payload", () => {
    const r = parseForecastEnvelope(JSON.stringify(FLAT));
    expect(r).toEqual({ ok: true, payload: FLAT });
  });

  it("unwraps the new { Success: true, Result } envelope", () => {
    const r = parseForecastEnvelope(JSON.stringify({ Success: true, Result: FLAT, Error: null }));
    expect(r).toEqual({ ok: true, payload: FLAT });
  });

  it("returns the error message and details for { Success: false, Error }", () => {
    const text = JSON.stringify({
      Success: false,
      Result: null,
      Error: { Type: "ValidationError", Message: "Invalid date format or parameters", Details: "Invalid from_date format. Use dd-MM-yyyy (e.g., 15-05-2024)." },
    });
    const r = parseForecastEnvelope(text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Invalid date format or parameters");
    expect(r.error).toContain("Use dd-MM-yyyy");
  });

  it("uses only the message when Details is null", () => {
    const r = parseForecastEnvelope(JSON.stringify({ Success: false, Result: null, Error: { Type: "X", Message: "FromDate must be before ToDate", Details: null } }));
    expect(r).toEqual({ ok: false, error: "FromDate must be before ToDate" });
  });

  it("fails on unparsable text", () => {
    const r = parseForecastEnvelope("An error occurred");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("An error occurred");
  });
});
