import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listTools, callTool, _resetToolCache } from "./poweroffice-mcp";

const MCP_URL = "https://mcp.example.com/api";
const MCP_KEY = "test-key";

beforeEach(() => {
  _resetToolCache();
  vi.stubEnv("POWEROFFICE_MCP_URL", MCP_URL);
  vi.stubEnv("POWEROFFICE_MCP_KEY", MCP_KEY);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("listTools", () => {
  it("sends correct URL, headers, and JSON-RPC body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          tools: [
            { name: "getForecast", description: "Get forecast", inputSchema: { type: "object" } },
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const tools = await listTools();

    expect(mockFetch).toHaveBeenCalledWith(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-functions-key": MCP_KEY },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("getForecast");
  });

  it("caches result — second call does not re-fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { tools: [] } }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await listTools();
    await listTools();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error" })
    );
    await expect(listTools()).rejects.toThrow("MCP tools/list failed: 500");
  });

  it("throws on JSON-RPC error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: { code: -32601, message: "Method not found" } }),
      })
    );
    await expect(listTools()).rejects.toThrow("MCP error");
  });
});

describe("callTool", () => {
  it("sends correct URL, headers, and JSON-RPC body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { content: [{ type: "text", text: "Forecast data" }] },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await callTool("getForecast", { month: "2026-04" });

    expect(mockFetch).toHaveBeenCalledWith(MCP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-functions-key": MCP_KEY },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "getForecast", arguments: { month: "2026-04" } },
      }),
    });
    expect(result.content[0].text).toBe("Forecast data");
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" })
    );
    await expect(callTool("getForecast", {})).rejects.toThrow("MCP tools/call failed: 403");
  });
});
