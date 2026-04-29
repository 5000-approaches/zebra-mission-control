import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp-integrations", () => ({
  INTEGRATIONS: [
    {
      id: "poweroffice",
      label: "PowerOffice",
      loadTools: vi.fn(),
    },
  ],
}));

import { GET } from "../route";
import { INTEGRATIONS } from "@/lib/mcp-integrations";
import type { ToolsApiResponse } from "../route";

const loadTools = INTEGRATIONS[0].loadTools as ReturnType<typeof vi.fn>;

beforeEach(() => {
  loadTools.mockReset();
});

describe("GET /api/integrations/tools", () => {
  it("returns each integration's tools", async () => {
    loadTools.mockResolvedValue([
      { name: "forecast", description: "Build a forecast", inputSchema: {} },
      { name: "list_invoices", description: "List invoices", inputSchema: {} },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ToolsApiResponse;

    expect(body.integrations).toHaveLength(1);
    expect(body.integrations[0]).toMatchObject({
      id: "poweroffice",
      label: "PowerOffice",
      tools: [
        { name: "forecast", description: "Build a forecast" },
        { name: "list_invoices", description: "List invoices" },
      ],
    });
    expect(body.integrations[0].error).toBeUndefined();
  });

  it("returns an error string when an integration's loadTools throws", async () => {
    loadTools.mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as ToolsApiResponse;

    expect(body.integrations[0].tools).toEqual([]);
    expect(body.integrations[0].error).toBe("connection refused");
  });

  it("strips inputSchema from tool entries (response shape contract)", async () => {
    loadTools.mockResolvedValue([
      { name: "forecast", description: "x", inputSchema: { type: "object", properties: { a: {} } } },
    ]);

    const res = await GET();
    const body = (await res.json()) as ToolsApiResponse;
    expect(body.integrations[0].tools[0]).toEqual({ name: "forecast", description: "x" });
    expect((body.integrations[0].tools[0] as Record<string, unknown>).inputSchema).toBeUndefined();
  });
});
