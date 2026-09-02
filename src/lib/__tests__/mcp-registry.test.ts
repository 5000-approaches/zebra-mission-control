import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/mcp-servers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mcp-servers")>("@/lib/mcp-servers");
  return { ...actual, loadServers: vi.fn() };
});
vi.mock("@/lib/mcp-client", () => ({
  listServerTools: vi.fn(),
  callServerTool: vi.fn(),
}));

import { loadServers, type McpServerConfig } from "@/lib/mcp-servers";
import { listServerTools, callServerTool } from "@/lib/mcp-client";
import { listAllTools, agentTools, callNamespacedTool, splitNamespacedName } from "@/lib/mcp-registry";

const PO: McpServerConfig = { id: "poweroffice", name: "PowerOffice", url: "https://po", headerName: "x-functions-key", key: "k1", builtIn: true };
const HUB: McpServerConfig = { id: "hubspot", name: "HubSpot", url: "https://hub", headerName: "Authorization", key: "k2", builtIn: false };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadServers).mockResolvedValue([PO, HUB]);
});

describe("listAllTools", () => {
  it("returns tools per server with public server info and isolates failures", async () => {
    vi.mocked(listServerTools).mockImplementation(async (server) => {
      if (server.id === "hubspot") throw new Error("hub down");
      return [{ name: "forecast", description: "F", inputSchema: {} }];
    });

    const result = await listAllTools();

    expect(result).toHaveLength(2);
    expect(result[0].server.id).toBe("poweroffice");
    expect("key" in result[0].server).toBe(false);
    expect(result[0].tools).toHaveLength(1);
    expect(result[0].error).toBeUndefined();
    expect(result[1].tools).toEqual([]);
    expect(result[1].error).toBe("hub down");
  });

  it("passes fresh through to the client", async () => {
    vi.mocked(listServerTools).mockResolvedValue([]);
    await listAllTools({ fresh: true });
    expect(listServerTools).toHaveBeenCalledWith(PO, { fresh: true });
  });
});

describe("agentTools", () => {
  it("namespaces tool names as serverId__toolName and keeps schemas", async () => {
    vi.mocked(listServerTools).mockImplementation(async (server) =>
      server.id === "poweroffice"
        ? [{ name: "forecast", description: "F", inputSchema: { type: "object" } }]
        : [{ name: "deals", description: "D", inputSchema: { type: "object", properties: {} } }]
    );

    const tools = await agentTools();

    expect(tools.map((t) => t.name)).toEqual(["poweroffice__forecast", "hubspot__deals"]);
    expect(tools[0].description).toContain("F");
    expect(tools[1].input_schema).toEqual({ type: "object", properties: {} });
    for (const t of tools) expect(t.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
  });

  it("skips servers that fail to list", async () => {
    vi.mocked(listServerTools).mockImplementation(async (server) => {
      if (server.id === "hubspot") throw new Error("x");
      return [{ name: "a", description: "", inputSchema: {} }];
    });
    expect((await agentTools()).map((t) => t.name)).toEqual(["poweroffice__a"]);
  });
});

describe("callNamespacedTool", () => {
  it("routes to the right server and un-namespaced tool name", async () => {
    vi.mocked(callServerTool).mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const r = await callNamespacedTool("hubspot__deals", { limit: 1 });
    expect(callServerTool).toHaveBeenCalledWith(HUB, "deals", { limit: 1 });
    expect(r.content[0].text).toBe("ok");
  });

  it("supports tool names containing double underscores after the prefix", async () => {
    vi.mocked(callServerTool).mockResolvedValue({ content: [] });
    await callNamespacedTool("poweroffice__get__thing", {});
    expect(callServerTool).toHaveBeenCalledWith(PO, "get__thing", {});
  });

  it("throws for unknown server ids or malformed names", async () => {
    await expect(callNamespacedTool("nope__x", {})).rejects.toThrow("Unknown MCP server");
    await expect(callNamespacedTool("noprefix", {})).rejects.toThrow("Malformed tool name");
  });
});

describe("splitNamespacedName", () => {
  it("splits on the first double underscore", () => {
    expect(splitNamespacedName("a__b__c")).toEqual({ serverId: "a", toolName: "b__c" });
    expect(splitNamespacedName("plain")).toBeNull();
  });
});
