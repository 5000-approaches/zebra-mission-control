import { describe, it, expect } from "vitest";
import { ThinkingDots } from "@/components/ThinkingDots";

type El = { props?: Record<string, unknown> };

function countByClass(node: unknown, cls: string, depth = 0): number {
  if (depth > 40 || node == null || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n, c) => n + countByClass(c, cls, depth), 0);
  const el = node as El;
  const className = typeof el.props?.className === "string" ? el.props.className : "";
  const self = className.includes(cls) ? 1 : 0;
  return self + countByClass(el.props?.children, cls, depth + 1);
}

function textContent(node: unknown, depth = 0): string {
  if (depth > 40 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => textContent(n, depth)).join("");
  if (typeof node === "object") return textContent((node as El).props?.children, depth + 1);
  return "";
}

describe("ThinkingDots", () => {
  it("is a status region with an accessible 'thinking' label", () => {
    const el = ThinkingDots() as El;
    expect(el.props?.role).toBe("status");
    expect(String(el.props?.["aria-label"]).toLowerCase()).toContain("thinking");
    expect(el.props?.["data-testid"]).toBe("thinking-indicator");
  });

  it("renders three animated (bouncing) dots, not a static character", () => {
    expect(countByClass(ThinkingDots(), "animate-bounce")).toBe(3);
  });

  it("disables the animation under prefers-reduced-motion", () => {
    expect(countByClass(ThinkingDots(), "motion-reduce:animate-none")).toBe(3);
  });

  it("includes screen-reader text so the status is announced", () => {
    const el = ThinkingDots();
    expect(countByClass(el, "sr-only")).toBe(1);
    expect(textContent(el).toLowerCase()).toContain("thinking");
  });
});
