import { describe, it, expect } from "vitest";
import { AgentHeader } from "@/components/AgentHeader";

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

describe("AgentHeader (home page header)", () => {
  it("greets with the first name", () => {
    const text = flatten(AgentHeader({ firstName: "Rune" }));
    expect(text).toContain("Hello");
    expect(text).toContain("Rune");
  });

  it("renders bare 'Hello' when no name is known", () => {
    const text = flatten(AgentHeader({ firstName: "" }));
    expect(text).toContain("Hello");
  });

  it("names the Zebra Agent in the subtitle", () => {
    const text = flatten(AgentHeader({ firstName: "" }));
    expect(text).toContain("Zebra Agent");
  });

  it("uses an h1 for the greeting", () => {
    const el = AgentHeader({ firstName: "Rune" }) as { props: { children: Array<{ type?: string }> } };
    const h1 = el.props.children.find((c) => c?.type === "h1");
    expect(h1).toBeDefined();
  });
});
