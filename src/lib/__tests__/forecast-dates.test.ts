import { describe, it, expect } from "vitest";
import { toDdMmYyyy } from "@/lib/forecast-dates";

describe("toDdMmYyyy", () => {
  it("converts an ISO date to the dd-MM-yyyy format the PowerOffice MCP requires", () => {
    expect(toDdMmYyyy("2026-09-01")).toBe("01-09-2026");
    expect(toDdMmYyyy("2024-05-15")).toBe("15-05-2024");
  });

  it("throws on anything that is not yyyy-MM-dd", () => {
    expect(() => toDdMmYyyy("01-09-2026")).toThrow();
    expect(() => toDdMmYyyy("")).toThrow();
  });
});
