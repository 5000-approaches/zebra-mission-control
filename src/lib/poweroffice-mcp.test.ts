import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listTools, callTool, _resetToolCache } from "./poweroffice-mcp";

const MCP_URL = "https://mcp.example.com/api";
const MCP_KEY = "test-key";

const EXPECTED_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
  "x-functions-key": MCP_KEY,
};

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => JSON.stringify(body),
  };
}

function sseResponse(body: unknown) {
  const sse = `event: message\ndata: ${JSON.stringify(body)}\n\n`;
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "text/event-stream" : null) },
    text: async () => sse,
  };
}

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
  it("sends correct URL, headers (incl. SSE Accept), and JSON-RPC body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        result: {
          tools: [
            { name: "getForecast", description: "Get forecast", inputSchema: { type: "object" } },
          ],
        },
      })
    );
    vi.stubGlobal("fetch", mockFetch);

    const tools = await listTools();

    expect(mockFetch).toHaveBeenCalledWith(MCP_URL, {
      method: "POST",
      headers: EXPECTED_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("getForecast");
  });

  it("parses SSE response (text/event-stream content-type)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse({
          result: {
            tools: [{ name: "forecast", description: "MCP forecast tool", inputSchema: {} }],
          },
          id: 1,
          jsonrpc: "2.0",
        })
      )
    );

    const tools = await listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("forecast");
  });

  it("caches result — second call does not re-fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { tools: [] } }));
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
      vi.fn().mockResolvedValue(jsonResponse({ error: { code: -32601, message: "Method not found" } }))
    );
    await expect(listTools()).rejects.toThrow("MCP error");
  });

  it("throws when SSE response has no data line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => "text/event-stream" },
        text: async () => "event: message\n\n",
      })
    );
    await expect(listTools()).rejects.toThrow("MCP SSE response had no data line");
  });
});

describe("callTool", () => {
  it("sends correct URL, headers, and JSON-RPC body", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ result: { content: [{ type: "text", text: "Forecast data" }] } })
    );
    vi.stubGlobal("fetch", mockFetch);

    const result = await callTool("getForecast", { month: "2026-04" });

    expect(mockFetch).toHaveBeenCalledWith(MCP_URL, {
      method: "POST",
      headers: EXPECTED_HEADERS,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "getForecast", arguments: { month: "2026-04" } },
      }),
    });
    expect(result.content[0].text).toBe("Forecast data");
  });

  it("parses SSE response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse({ result: { content: [{ type: "text", text: "SSE forecast" }] }, id: 2, jsonrpc: "2.0" })
      )
    );

    const result = await callTool("forecast", {});
    expect(result.content[0].text).toBe("SSE forecast");
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: "Forbidden" })
    );
    await expect(callTool("getForecast", {})).rejects.toThrow("MCP tools/call failed: 403");
  });
});
