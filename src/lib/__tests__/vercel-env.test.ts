import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEnvValue, setEnvValue, deleteEnvValue, _resetEnvCache } from "@/lib/vercel-env";

const PROJECT = "prj_test";

function listResponse(envs: Array<{ id: string; key: string; value?: string }>) {
  return { ok: true, status: 200, json: async () => ({ envs }) };
}

beforeEach(() => {
  _resetEnvCache();
  vi.stubEnv("VERCEL_ADMIN_TOKEN", "tok");
  vi.stubEnv("VERCEL_PROJECT_ID", PROJECT);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getEnvValue", () => {
  it("lists project env vars with decrypt=true and returns the matching value", async () => {
    const mockFetch = vi.fn().mockResolvedValue(listResponse([{ id: "e1", key: "MCP_SERVERS", value: "[]" }]));
    vi.stubGlobal("fetch", mockFetch);

    const value = await getEnvValue("MCP_SERVERS");

    expect(value).toBe("[]");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`https://api.vercel.com/v9/projects/${PROJECT}/env?decrypt=true`);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("returns null when the key does not exist", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(listResponse([])));
    expect(await getEnvValue("NOPE")).toBeNull();
  });

  it("caches the listing so a second read does not re-fetch", async () => {
    const mockFetch = vi.fn().mockResolvedValue(listResponse([{ id: "e1", key: "A", value: "1" }]));
    vi.stubGlobal("fetch", mockFetch);
    await getEnvValue("A");
    await getEnvValue("A");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("falls back to process.env when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    vi.stubEnv("MCP_SERVERS", "[{\"id\":\"x\"}]");
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    expect(await getEnvValue("MCP_SERVERS")).toBe("[{\"id\":\"x\"}]");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("throws when the Vercel API responds with an error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) }));
    await expect(getEnvValue("A")).rejects.toThrow("Vercel env list failed: 403");
  });
});

describe("setEnvValue", () => {
  it("PATCHes an existing env var by id", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: "e9", key: "MCP_SERVERS", value: "[]" }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", mockFetch);

    await setEnvValue("MCP_SERVERS", "[1]");

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe(`https://api.vercel.com/v9/projects/${PROJECT}/env/e9`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ value: "[1]" });
  });

  it("POSTs a new encrypted env var for all targets when the key is absent", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", mockFetch);

    await setEnvValue("MCP_CATALOG_X", "{}");

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe(`https://api.vercel.com/v10/projects/${PROJECT}/env`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      key: "MCP_CATALOG_X",
      value: "{}",
      type: "encrypted",
      target: ["production", "preview", "development"],
    });
  });

  it("invalidates the cache so the next read sees the new value", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: "e9", key: "A", value: "old" }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce(listResponse([{ id: "e9", key: "A", value: "new" }]));
    vi.stubGlobal("fetch", mockFetch);

    await setEnvValue("A", "new");
    expect(await getEnvValue("A")).toBe("new");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws a clear error when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    await expect(setEnvValue("A", "1")).rejects.toThrow("VERCEL_ADMIN_TOKEN is not set");
  });

  it("throws when the write fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(listResponse([])).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    );
    await expect(setEnvValue("A", "1")).rejects.toThrow("Vercel env write failed: 500");
  });
});

describe("deleteEnvValue", () => {
  it("DELETEs the env var by id and invalidates the cache", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(listResponse([{ id: "e7", key: "MCP_CATALOG_X", value: "{}" }]))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce(listResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    await deleteEnvValue("MCP_CATALOG_X");

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toBe(`https://api.vercel.com/v9/projects/${PROJECT}/env/e7`);
    expect(init.method).toBe("DELETE");
    expect(await getEnvValue("MCP_CATALOG_X")).toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("is a no-op when the key does not exist", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(listResponse([]));
    vi.stubGlobal("fetch", mockFetch);
    await deleteEnvValue("NOPE");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    await expect(deleteEnvValue("A")).rejects.toThrow("VERCEL_ADMIN_TOKEN is not set");
  });
});

describe("setEnvValue concurrency", () => {
  it("serializes concurrent writes to the same key so the second sees the first's created id", async () => {
    let created = false;
    const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        created = true;
        return { ok: true, status: 200, json: async () => ({}) };
      }
      if (init?.method === "PATCH") return { ok: true, status: 200, json: async () => ({}) };
      return listResponse(created ? [{ id: "new1", key: "K", value: "x" }] : []);
    });
    vi.stubGlobal("fetch", mockFetch);

    await Promise.all([setEnvValue("K", "1"), setEnvValue("K", "2")]);

    const methods = mockFetch.mock.calls.map(([, init]) => init?.method ?? "GET");
    expect(methods.filter((m) => m === "POST")).toHaveLength(1);
    expect(methods.filter((m) => m === "PATCH")).toHaveLength(1);
  });
});
