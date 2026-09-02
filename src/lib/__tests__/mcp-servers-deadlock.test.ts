import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mutateServers, type McpServerConfig } from "@/lib/mcp-servers";
import { _resetEnvCache } from "@/lib/vercel-env";

/**
 * Regression: mutateServers used to take the per-key lock and then call
 * setEnvValue, which took the same (non re-entrant) lock again — it waited on
 * itself forever and "Add server" hung in production. This test uses the REAL
 * vercel-env module with a mocked fetch, so the lock path is exercised.
 */

const SERVER: McpServerConfig = {
  id: "gurobot",
  name: "Gurobot",
  url: "https://gurobot.example.com/sse",
  headerName: "x-functions-key",
  key: "",
};

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`deadlock: not resolved within ${ms}ms`)), ms))]);
}

beforeEach(() => {
  _resetEnvCache();
  vi.stubEnv("VERCEL_ADMIN_TOKEN", "tok");
  vi.stubEnv("VERCEL_PROJECT_ID", "prj_test");
  vi.stubEnv("POWEROFFICE_MCP_URL", "");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("mutateServers (real env store, mocked fetch)", () => {
  it("resolves and persists a new server without waiting on its own lock", async () => {
    let stored: string | null = null;
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET" && url.endsWith("/env/e1")) {
        return { ok: true, status: 200, json: async () => ({ id: "e1", value: stored }) };
      }
      if (method === "GET") {
        return { ok: true, status: 200, json: async () => ({ envs: stored === null ? [] : [{ id: "e1", key: "MCP_SERVERS", value: "ciphertext" }] }) };
      }
      if (method === "POST" || method === "PATCH") {
        stored = (JSON.parse(init?.body as string) as { value: string }).value;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      throw new Error(`unexpected ${method} ${url}`);
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await withDeadline(mutateServers((current) => [...current, SERVER]), 2000);

    expect(result.map((s) => s.id)).toEqual(["gurobot"]);
    expect(JSON.parse(stored ?? "[]")).toEqual([{ id: "gurobot", name: "Gurobot", url: SERVER.url, headerName: "x-functions-key", key: "" }]);
  });

  it("resolves quickly when nothing changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ envs: [] }) })));
    await expect(withDeadline(mutateServers((c) => c), 2000)).resolves.toEqual([]);
  });
});
