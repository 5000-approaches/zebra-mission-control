import { describe, it, expect, vi } from "vitest";
import BillableForecastPage from "../page";

vi.mock("lucide-react", () => ({
  LineChart: () => null,
}));

function flatten(node: unknown, depth = 0): string {
  if (depth > 20 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => flatten(n, depth)).join(" ");
  if (typeof node === "object" && node !== null) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      try {
        return flatten(
          (el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}),
          depth + 1
        );
      } catch {
        return "";
      }
    }
    if (el.props) return flatten(el.props.children, depth + 1);
  }
  return "";
}

describe("BillableForecastPage", () => {
  it("exports a default React component", () => {
    expect(typeof BillableForecastPage).toBe("function");
  });

  it("renders the Billable Forecast heading", () => {
    const text = flatten(BillableForecastPage());
    expect(text).toContain("Billable Forecast");
  });

  it("shows Coming soon text", () => {
    const text = flatten(BillableForecastPage());
    expect(text).toContain("Coming soon");
  });

  it("renders a main element with flex layout", () => {
    const output = BillableForecastPage();
    const el = output as { type?: string; props?: { className?: string } };
    expect(el.type).toBe("main");
    expect(el.props?.className).toContain("flex");
  });
});
