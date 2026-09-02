import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/vercel-env", () => ({
  getEnvValue: vi.fn(),
  setEnvValue: vi.fn(),
}));

const anthropicMocks = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = anthropicMocks;
  },
}));

import { getEnvValue, setEnvValue } from "@/lib/vercel-env";
import { getCatalog, generateCatalog, catalogEnvKey, fallbackCatalog } from "@/lib/tool-catalog";
import type { McpServerConfig } from "@/lib/mcp-servers";
import type { McpTool } from "@/lib/mcp-client";

const SERVER: McpServerConfig = { id: "power-office", name: "PowerOffice", url: "https://po", headerName: "x", key: "k", builtIn: true };
const TOOLS: McpTool[] = [
  { name: "forecast", description: "Calculate financial revenue forecast. Uses time tracking data.", inputSchema: {} },
  { name: "top_projects", description: "Retrieve the top projects by billable amount.", inputSchema: {} },
];

const GENERATED = {
  tools: [
    { name: "forecast", friendlyName: "Revenue forecast", purpose: "Shows how much we will likely bill this month." },
    { name: "top_projects", friendlyName: "Top projects", purpose: "Shows which projects earn the most." },
  ],
  howToCombine: "Use the forecast, then top projects to see what drives it.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ANTHROPIC_API_KEY", "test");
});

describe("catalogEnvKey", () => {
  it("upper-snake-cases the server id", () => {
    expect(catalogEnvKey("power-office")).toBe("MCP_CATALOG_POWER_OFFICE");
  });
});

describe("fallbackCatalog", () => {
  it("uses the first sentence of each description and empty howToCombine", () => {
    const c = fallbackCatalog(SERVER, TOOLS);
    expect(c.tools[0]).toEqual({ name: "forecast", friendlyName: "forecast", purpose: "Calculate financial revenue forecast." });
    expect(c.howToCombine).toBe("");
    expect(c.toolNames).toEqual(["forecast", "top_projects"]);
  });
});

describe("generateCatalog", () => {
  it("asks Claude for a JSON catalog and persists it", async () => {
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(GENERATED) }] });

    const catalog = await generateCatalog(SERVER, TOOLS);

    expect(anthropicMocks.create).toHaveBeenCalledTimes(1);
    const params = anthropicMocks.create.mock.calls[0][0];
    expect(params.model).toBe("claude-opus-5");
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(catalog.tools).toEqual(GENERATED.tools);
    expect(catalog.howToCombine).toBe(GENERATED.howToCombine);
    expect(catalog.serverId).toBe("power-office");
    expect(catalog.toolNames).toEqual(["forecast", "top_projects"]);
    expect(setEnvValue).toHaveBeenCalledWith("MCP_CATALOG_POWER_OFFICE", JSON.stringify(catalog));
  });

  it("falls back to first-sentence summaries when Claude fails", async () => {
    anthropicMocks.create.mockRejectedValue(new Error("api down"));
    const catalog = await generateCatalog(SERVER, TOOLS);
    expect(catalog.tools[1].purpose).toBe("Retrieve the top projects by billable amount.");
    expect(catalog.generationError).toBe("api down");
    expect(setEnvValue).not.toHaveBeenCalled();
  });

  it("carries no generationError when Claude succeeds", async () => {
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(GENERATED) }] });
    const catalog = await generateCatalog(SERVER, TOOLS);
    expect(catalog.generationError).toBeUndefined();
  });

  it("fills in tools Claude omitted from the fallback", async () => {
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ tools: [GENERATED.tools[0]], howToCombine: "x" }) }] });
    const catalog = await generateCatalog(SERVER, TOOLS);
    expect(catalog.tools.map((t) => t.name)).toEqual(["forecast", "top_projects"]);
  });

  it("still returns a catalog when persisting fails", async () => {
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(GENERATED) }] });
    vi.mocked(setEnvValue).mockRejectedValue(new Error("no token"));
    const catalog = await generateCatalog(SERVER, TOOLS);
    expect(catalog.howToCombine).toBe(GENERATED.howToCombine);
  });
});

describe("getCatalog", () => {
  it("returns the stored catalog when its tool names match", async () => {
    const stored = { serverId: "power-office", generatedAt: "2026-01-01T00:00:00.000Z", toolNames: ["forecast", "top_projects"], ...GENERATED };
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify(stored));
    const catalog = await getCatalog(SERVER, TOOLS);
    expect(catalog).toEqual(stored);
    expect(anthropicMocks.create).not.toHaveBeenCalled();
  });

  it("regenerates when the tool list changed", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify({ serverId: "power-office", generatedAt: "x", toolNames: ["forecast"], tools: [], howToCombine: "" }));
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(GENERATED) }] });
    const catalog = await getCatalog(SERVER, TOOLS);
    expect(anthropicMocks.create).toHaveBeenCalledTimes(1);
    expect(catalog.tools).toHaveLength(2);
  });

  it("regenerates when nothing is stored or the stored value is malformed", async () => {
    vi.mocked(getEnvValue).mockResolvedValue("{broken");
    anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(GENERATED) }] });
    await getCatalog(SERVER, TOOLS);
    expect(anthropicMocks.create).toHaveBeenCalledTimes(1);
  });

  it("never throws: env read failure falls back to generation, generation failure to first sentences", async () => {
    vi.mocked(getEnvValue).mockRejectedValue(new Error("vercel down"));
    anthropicMocks.create.mockRejectedValue(new Error("api down"));
    const catalog = await getCatalog(SERVER, TOOLS);
    expect(catalog.tools[0].purpose).toBe("Calculate financial revenue forecast.");
  });
});
