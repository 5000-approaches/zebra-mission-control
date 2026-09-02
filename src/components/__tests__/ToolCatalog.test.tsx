import { describe, it, expect } from "vitest";
import { ToolCatalog, type CatalogIntegration } from "@/components/ToolCatalog";

function flatten(node: unknown, depth = 0): string {
  if (depth > 40 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => flatten(n, depth)).join(" ");
  if (typeof node === "object" && node !== null) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      return flatten((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), depth + 1);
    }
    const children = (el.props as { children?: unknown } | undefined)?.children;
    return flatten(children, depth);
  }
  return "";
}

function countTestId(node: unknown, id: string, depth = 0): number {
  if (depth > 40 || node == null || typeof node !== "object") return 0;
  if (Array.isArray(node)) return node.reduce((n, c) => n + countTestId(c, id, depth), 0);
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  const self = el.props?.["data-testid"] === id ? 1 : 0;
  if (typeof el.type === "function") {
    return self + countTestId((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), id, depth + 1);
  }
  return self + countTestId(el.props?.children, id, depth + 1);
}

const POWEROFFICE: CatalogIntegration = {
  id: "poweroffice",
  label: "PowerOffice",
  howToCombine: "Find a project first, then ask for its forecast.",
  tools: [
    { name: "forecast", description: "Calculate financial revenue. Long technical text follows.", friendlyName: "Revenue forecast", purpose: "Estimates what a period will bill." },
    { name: "discover_projects", description: "Discover available projects that can be used for filtering. More text." },
  ],
};

describe("ToolCatalog", () => {
  it("renders one server card per integration with the friendly name and tool count", () => {
    const el = ToolCatalog({ integrations: [POWEROFFICE, { id: "hubspot", label: "HubSpot", tools: [] }] });
    expect(countTestId(el, "integration-server")).toBe(2);
    const text = flatten(el);
    expect(text).toContain("PowerOffice");
    expect(text).toContain("2 tools");
    expect(text).toContain("HubSpot");
    expect(text).toContain("No tools exposed.");
  });

  it("shows plain-language name and purpose with the technical name", () => {
    const text = flatten(ToolCatalog({ integrations: [POWEROFFICE] }));
    expect(text).toContain("Revenue forecast");
    expect(text).toContain("Estimates what a period will bill.");
    expect(text).toContain("forecast");
    expect(text).toContain("Find a project first");
  });

  it("falls back to the first sentence of the description when no summary exists", () => {
    const text = flatten(ToolCatalog({ integrations: [POWEROFFICE] }));
    expect(text).toContain("Discover available projects that can be used for filtering.");
    expect(text).not.toContain("More text.");
  });

  it("renders a tool row per tool", () => {
    expect(countTestId(ToolCatalog({ integrations: [POWEROFFICE] }), "integration-tool")).toBe(2);
  });

  it("shows the error for a failing server and marks it unavailable", () => {
    const text = flatten(ToolCatalog({ integrations: [{ id: "x", label: "Broken", tools: [], error: "HTTP 503" }] }));
    expect(text).toContain("HTTP 503");
    expect(text).toContain("unavailable");
  });

  it("explains how to add a server when none is connected", () => {
    const text = flatten(ToolCatalog({ integrations: [] }));
    expect(text).toContain("No MCP servers connected yet");
  });
});
