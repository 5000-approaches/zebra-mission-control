import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listServerTools, callServerTool, _resetServerToolCache } from "@/lib/mcp-client";
import type { McpServerConfig } from "@/lib/mcp-servers";

const SERVER: McpServerConfig = {
  id: "hub",
  name: "HubSpot",
  url: "https://hub.example.com/mcp",
  headerName: "Authorization",
  key: "Bearer abc",
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
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: (k: string) => (k.toLowerCase() === "content-type" ? "text/event-stream" : null) },
    text: async () => `event: message\ndata: ${JSON.stringify(body)}\n\n`,
  };
}

beforeEach(() => {
  _resetServerToolCache();
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listServerTools", () => {
  it("posts tools/list to the server url with the configured auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({ result: { tools: [{ name: "deals", description: "List deals", inputSchema: { type: "object" } }] } })
    );
    vi.stubGlobal("fetch", mockFetch);

    const tools = await listServerTools(SERVER);

    expect(mockFetch).toHaveBeenCalledWith(
      SERVER.url,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: "Bearer abc",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      })
    );
    expect(tools).toEqual([{ name: "deals", description: "List deals", inputSchema: { type: "object" } }]);
  });

  it("parses SSE responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse({ result: { tools: [{ name: "a", description: "" }] } })));
    const tools = await listServerTools(SERVER);
    expect(tools[0]).toEqual({ name: "a", description: "", inputSchema: {} });
  });

  it("caches per server id and bypasses the cache with fresh", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { tools: [] } }));
    vi.stubGlobal("fetch", mockFetch);
    await listServerTools(SERVER);
    await listServerTools(SERVER);
    await listServerTools({ ...SERVER, id: "other" });
    await listServerTools(SERVER, { fresh: true });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws on HTTP and JSON-RPC errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: "Unauthorized" }));
    await expect(listServerTools(SERVER)).rejects.toThrow("MCP tools/list failed: 401");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { code: -1, message: "bad" } })));
    await expect(listServerTools(SERVER)).rejects.toThrow("MCP error");
  });
});

describe("unauthenticated servers", () => {
  it("sends no auth header when the key is empty", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { tools: [] } }));
    vi.stubGlobal("fetch", mockFetch);

    await listServerTools({ ...SERVER, key: "" });

    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});

describe("initialize retry for streamable HTTP", () => {
  it("initializes once and retries with the session id when the server demands a session", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: -32000, message: "Bad Request: No valid session ID provided" } }))
      .mockResolvedValueOnce({
        ...jsonResponse({ result: { protocolVersion: "2024-11-05" } }),
        headers: { get: (k: string) => (k.toLowerCase() === "mcp-session-id" ? "sess-1" : k.toLowerCase() === "content-type" ? "application/json" : null) },
      })
      .mockResolvedValueOnce({ ok: true, status: 202, statusText: "Accepted", headers: { get: () => null }, text: async () => "" })
      .mockResolvedValueOnce(jsonResponse({ result: { tools: [{ name: "a" }] } }));
    vi.stubGlobal("fetch", mockFetch);

    const tools = await listServerTools(SERVER);

    expect(tools).toEqual([{ name: "a", description: "", inputSchema: {} }]);
    expect(mockFetch).toHaveBeenCalledTimes(4);
    const bodies = mockFetch.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies.map((b) => b.method)).toEqual(["tools/list", "initialize", "notifications/initialized", "tools/list"]);
    expect(bodies[2]).not.toHaveProperty("id");
    const lastHeaders = mockFetch.mock.calls[3][1].headers as Record<string, string>;
    expect(lastHeaders["Mcp-Session-Id"]).toBe("sess-1");
  });

  it("does not retry twice when initialization does not help", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: -32000, message: "Server not initialized" } }));
    vi.stubGlobal("fetch", mockFetch);

    await expect(listServerTools(SERVER)).rejects.toThrow(/not initialized/);
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});

describe("callServerTool", () => {
  it("posts tools/call with name and arguments", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { content: [{ type: "text", text: "ok" }] } }));
    vi.stubGlobal("fetch", mockFetch);

    const result = await callServerTool(SERVER, "deals", { limit: 5 });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "deals", arguments: { limit: 5 } },
    });
    expect(result.content[0].text).toBe("ok");
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, statusText: "Down" }));
    await expect(callServerTool(SERVER, "x", {})).rejects.toThrow("MCP tools/call failed: 503");
  });
});

describe("hardening", () => {
  it("refuses redirects and applies a timeout signal", async () => {
    const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { tools: [] } }));
    vi.stubGlobal("fetch", mockFetch);
    await listServerTools(SERVER);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects response bodies larger than 1 MB", async () => {
    const huge = "x".repeat(1_048_577);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ...jsonResponse({}), text: async () => huge })
    );
    await expect(listServerTools(SERVER)).rejects.toThrow(/too large/i);
  });

  it("parses multi-event SSE bodies and picks the reply matching the request id", async () => {
    const body = [
      "event: ping",
      "data: {}",
      "",
      "event: message",
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 99, result: { tools: [{ name: "wrong" }] } })}`,
      "",
      "event: message",
      `data: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "right" }] } })}`,
      "",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ...sseResponse({}), text: async () => body }));
    const tools = await listServerTools(SERVER);
    expect(tools.map((t) => t.name)).toEqual(["right"]);
  });

  it("falls back to the last parsable SSE event when no id matches", async () => {
    const body = [
      "data: not json",
      "",
      `data: ${JSON.stringify({ result: { tools: [{ name: "last" }] } })}`,
      "",
    ].join("\n");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ...sseResponse({}), text: async () => body }));
    const tools = await listServerTools(SERVER);
    expect(tools.map((t) => t.name)).toEqual(["last"]);
  });

  it("expires the tool cache after 30 seconds", async () => {
    vi.useFakeTimers();
    try {
      const mockFetch = vi.fn().mockResolvedValue(jsonResponse({ result: { tools: [] } }));
      vi.stubGlobal("fetch", mockFetch);
      await listServerTools(SERVER);
      vi.advanceTimersByTime(29_000);
      await listServerTools(SERVER);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2_000);
      await listServerTools(SERVER);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
