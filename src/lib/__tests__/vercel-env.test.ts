import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEnvValue, setEnvValue, deleteEnvValue, updateEnvValue, withKeyLock, _resetEnvCache } from "@/lib/vercel-env";

const PROJECT = "prj_test";
const LIST_URL = `https://api.vercel.com/v9/projects/${PROJECT}/env`;
const CREATE_URL = `https://api.vercel.com/v10/projects/${PROJECT}/env`;
const CIPHERTEXT = "eyJ2IjoidjIiLCJjIjoi…";

type Stored = Record<string, { id: string; value: string }>;
type Call = { method: string; url: string; body?: unknown };

/**
 * Fake Vercel env API: the list endpoint returns ciphertext (like the real one
 * does for "encrypted" vars); the per-id endpoint returns the decrypted value.
 */
function fakeVercel(initial: Stored, opts: { failWrite?: boolean; failList?: boolean } = {}) {
  const store: Stored = { ...initial };
  const calls: Call[] = [];
  let nextId = 100;
  const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method, url, body });
    if (method === "GET" && url.startsWith(`${LIST_URL}`) && !url.startsWith(`${LIST_URL}/`)) {
      if (opts.failList) return json(403, {});
      return json(200, { envs: Object.entries(store).map(([key, e]) => ({ id: e.id, key, value: CIPHERTEXT })) });
    }
    if (method === "GET") {
      const id = url.slice(`${LIST_URL}/`.length);
      const entry = Object.values(store).find((e) => e.id === id);
      return entry ? json(200, { id, value: entry.value }) : json(404, {});
    }
    if (opts.failWrite) return json(500, {});
    if (method === "POST" && url === CREATE_URL) {
      store[body.key] = { id: `e${nextId++}`, value: body.value };
      return json(200, {});
    }
    if (method === "PATCH") {
      const id = url.slice(`${LIST_URL}/`.length);
      const key = Object.keys(store).find((k) => store[k].id === id)!;
      store[key] = { id, value: body.value };
      return json(200, {});
    }
    if (method === "DELETE") {
      const id = url.slice(`${LIST_URL}/`.length);
      const key = Object.keys(store).find((k) => store[k].id === id)!;
      delete store[key];
      return json(200, {});
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, store, fetchMock, methods: () => calls.map((c) => c.method) };
}

beforeEach(() => {
  _resetEnvCache();
  vi.stubEnv("VERCEL_ADMIN_TOKEN", "tok");
  vi.stubEnv("VERCEL_PROJECT_ID", PROJECT);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getEnvValue", () => {
  it("maps the key to an id via the listing, then reads the decrypted value from the per-item endpoint", async () => {
    const api = fakeVercel({ MCP_SERVERS: { id: "e1", value: "[]" } });

    const value = await getEnvValue("MCP_SERVERS");

    expect(value).toBe("[]");
    expect(api.calls.map((c) => c.url)).toEqual([LIST_URL, `${LIST_URL}/e1`]);
    const init = api.fetchMock.mock.calls[1][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("never returns the ciphertext from the listing", async () => {
    fakeVercel({ K: { id: "e1", value: "plain" } });
    expect(await getEnvValue("K")).toBe("plain");
  });

  it("returns null when the key does not exist and does not hit the per-item endpoint", async () => {
    const api = fakeVercel({});
    expect(await getEnvValue("NOPE")).toBeNull();
    expect(api.calls).toHaveLength(1);
  });

  it("caches the decrypted value so a second read does not re-fetch", async () => {
    const api = fakeVercel({ A: { id: "e1", value: "1" } });
    await getEnvValue("A");
    await getEnvValue("A");
    expect(api.calls).toHaveLength(2);
  });

  it("reuses the cached listing for a different key but reads that key's own value", async () => {
    const api = fakeVercel({ A: { id: "e1", value: "1" }, B: { id: "e2", value: "2" } });
    await getEnvValue("A");
    expect(await getEnvValue("B")).toBe("2");
    expect(api.calls.map((c) => c.url)).toEqual([LIST_URL, `${LIST_URL}/e1`, `${LIST_URL}/e2`]);
  });

  it("falls back to process.env when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    vi.stubEnv("MCP_SERVERS", "[{\"id\":\"x\"}]");
    const api = fakeVercel({});
    expect(await getEnvValue("MCP_SERVERS")).toBe("[{\"id\":\"x\"}]");
    expect(api.calls).toHaveLength(0);
  });

  it("throws when the Vercel API responds with an error", async () => {
    fakeVercel({}, { failList: true });
    await expect(getEnvValue("A")).rejects.toThrow("Vercel env list failed: 403");
  });
});

describe("setEnvValue", () => {
  it("PATCHes an existing env var by id", async () => {
    const api = fakeVercel({ MCP_SERVERS: { id: "e9", value: "[]" } });

    await setEnvValue("MCP_SERVERS", "[1]");

    const patch = api.calls.find((c) => c.method === "PATCH");
    expect(patch?.url).toBe(`${LIST_URL}/e9`);
    expect(patch?.body).toEqual({ value: "[1]" });
    expect(api.store.MCP_SERVERS.value).toBe("[1]");
  });

  it("POSTs a new encrypted env var for all targets when the key is absent", async () => {
    const api = fakeVercel({});

    await setEnvValue("MCP_CATALOG_X", "{}");

    const post = api.calls.find((c) => c.method === "POST");
    expect(post?.url).toBe(CREATE_URL);
    expect(post?.body).toEqual({ key: "MCP_CATALOG_X", value: "{}", type: "encrypted", target: ["production", "preview", "development"] });
  });

  it("invalidates the cache so the next read sees the new value", async () => {
    fakeVercel({ A: { id: "e9", value: "old" } });
    expect(await getEnvValue("A")).toBe("old");
    await setEnvValue("A", "new");
    expect(await getEnvValue("A")).toBe("new");
  });

  it("throws a clear error when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    await expect(setEnvValue("A", "1")).rejects.toThrow("VERCEL_ADMIN_TOKEN is not set");
  });

  it("throws when the write fails", async () => {
    fakeVercel({}, { failWrite: true });
    await expect(setEnvValue("A", "1")).rejects.toThrow("Vercel env write failed: 500");
  });
});

describe("deleteEnvValue", () => {
  it("DELETEs the env var by id and invalidates the cache", async () => {
    const api = fakeVercel({ MCP_CATALOG_X: { id: "e7", value: "{}" } });
    expect(await getEnvValue("MCP_CATALOG_X")).toBe("{}");

    await deleteEnvValue("MCP_CATALOG_X");

    const del = api.calls.find((c) => c.method === "DELETE");
    expect(del?.url).toBe(`${LIST_URL}/e7`);
    expect(await getEnvValue("MCP_CATALOG_X")).toBeNull();
  });

  it("is a no-op when the key does not exist", async () => {
    const api = fakeVercel({});
    await deleteEnvValue("NOPE");
    expect(api.methods()).toEqual(["GET"]);
  });

  it("throws a clear error when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    await expect(deleteEnvValue("A")).rejects.toThrow("VERCEL_ADMIN_TOKEN is not set");
  });
});

describe("updateEnvValue", () => {
  it("reads the decrypted value fresh inside the lock (ignoring a warm cache) and PATCHes the changed result", async () => {
    const api = fakeVercel({ K: { id: "e1", value: "fresh" } });
    await getEnvValue("K");
    api.store.K = { id: "e1", value: "fresher" }; // changed elsewhere after our cache filled

    const seen: Array<string | null> = [];
    await updateEnvValue("K", (current) => {
      seen.push(current);
      return `${current}+1`;
    });

    expect(seen).toEqual(["fresher"]);
    expect(api.store.K.value).toBe("fresher+1");
    expect(await getEnvValue("K")).toBe("fresher+1");
  });

  it("does not write when the updater returns the same value or null", async () => {
    const api = fakeVercel({ K: { id: "e1", value: "v" } });
    await updateEnvValue("K", (current) => current);
    await updateEnvValue("K", () => null);
    expect(api.methods().every((m) => m === "GET")).toBe(true);
  });

  it("creates the var when it does not exist yet", async () => {
    const api = fakeVercel({});
    await updateEnvValue("NEW", (current) => (current === null ? "[]" : current));
    expect(api.store.NEW.value).toBe("[]");
    expect(api.methods()).toContain("POST");
  });

  it("falls back to process.env for the read and throws only if a write is needed without a token", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");
    vi.stubEnv("K", "local");
    fakeVercel({});
    await expect(updateEnvValue("K", (c) => c)).resolves.toBeUndefined();
    await expect(updateEnvValue("K", () => "changed")).rejects.toThrow(/VERCEL_ADMIN_TOKEN/);
  });

  it("never waits on itself: resolves even though it takes the key lock internally", async () => {
    fakeVercel({ K: { id: "e1", value: "v" } });
    const done = updateEnvValue("K", (c) => c);
    await expect(Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error("deadlock")), 2000))])).resolves.toBeUndefined();
  });

  it("is serialized with other lock holders for the same key", async () => {
    fakeVercel({});
    const order: string[] = [];
    const first = withKeyLock("K", async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push("first");
    });
    const second = updateEnvValue("K", (c) => {
      order.push("second");
      return c;
    });
    await Promise.all([first, second]);
    expect(order).toEqual(["first", "second"]);
  });
});

describe("setEnvValue concurrency", () => {
  it("serializes concurrent writes to the same key so the second sees the first's created id", async () => {
    const api = fakeVercel({});
    await Promise.all([setEnvValue("K", "1"), setEnvValue("K", "2")]);
    expect(api.methods().filter((m) => m === "POST")).toHaveLength(1);
    expect(api.methods().filter((m) => m === "PATCH")).toHaveLength(1);
    expect(api.store.K.value).toBe("2");
  });
});
