import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillsApiResponse } from "@/app/api/integrations/skills/route";

const mockSet = vi.fn();
let stateValues: [unknown, typeof mockSet][] = [];
let stateCallIdx = 0;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useEffect: vi.fn(),
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

import IntegrationSkillsList from "../IntegrationSkillsList";

const MOCK_RESPONSE: SkillsApiResponse = {
  integrations: [
    {
      id: "poweroffice",
      label: "PowerOffice",
      tools: [
        { name: "forecast", description: "Build a forecast" },
        { name: "list_invoices", description: "List invoices" },
      ],
    },
  ],
};

function setStates(data: unknown, loading: boolean, error: unknown, open: boolean) {
  stateValues = [
    [data, mockSet],
    [loading, mockSet],
    [error, mockSet],
    [open, mockSet],
  ];
  stateCallIdx = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  stateCallIdx = 0;
});

describe("IntegrationSkillsList", () => {
  it("shows a 'Loading skills…' label while loading (header variant)", () => {
    setStates(null, true, null, false);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("Loading skills");
  });

  it("renders the count of tools across all integrations on the pill", () => {
    setStates(MOCK_RESPONSE, false, null, false);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("Available skills (2)");
  });

  it("does not render tool details when collapsed", () => {
    setStates(MOCK_RESPONSE, false, null, false);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).not.toContain("Build a forecast");
  });

  it("renders tool names and descriptions when expanded", () => {
    setStates(MOCK_RESPONSE, false, null, true);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("forecast");
    expect(text).toContain("Build a forecast");
    expect(text).toContain("list_invoices");
    expect(text).toContain("List invoices");
  });

  it("shows the integration label when filterId is omitted", () => {
    setStates(MOCK_RESPONSE, false, null, true);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("PowerOffice");
  });

  it("hides the integration label when filterId narrows to one integration", () => {
    setStates(MOCK_RESPONSE, false, null, true);
    const text = flatten(IntegrationSkillsList({ filterId: "poweroffice" }));
    expect(text).not.toContain("PowerOffice"); // label suppressed when filtered
    expect(text).toContain("forecast");
  });

  it("filters out integrations not matching filterId", () => {
    setStates(
      {
        integrations: [
          { id: "other", label: "Other", tools: [{ name: "other_tool", description: "x" }] },
          { id: "poweroffice", label: "PowerOffice", tools: [{ name: "forecast", description: "y" }] },
        ],
      },
      false,
      null,
      true
    );
    const text = flatten(IntegrationSkillsList({ filterId: "poweroffice" }));
    expect(text).toContain("forecast");
    expect(text).not.toContain("other_tool");
  });

  it("renders an error message in embedded variant when fetch failed", () => {
    setStates(null, false, "Network error", false);
    const text = flatten(IntegrationSkillsList({ variant: "embedded" }));
    expect(text).toContain("Could not load skills");
    expect(text).toContain("Network error");
  });

  it("renders 'No integrations configured' when integrations array is empty", () => {
    setStates({ integrations: [] }, false, null, true);
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("No integrations configured");
  });

  it("surfaces a per-integration error from the API response", () => {
    setStates(
      {
        integrations: [
          { id: "poweroffice", label: "PowerOffice", tools: [], error: "MCP unreachable" },
        ],
      },
      false,
      null,
      true
    );
    const text = flatten(IntegrationSkillsList({}));
    expect(text).toContain("MCP unreachable");
  });
});
