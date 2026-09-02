import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/vercel-env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vercel-env")>("@/lib/vercel-env");
  const getEnvValue = vi.fn();
  const setEnvValue = vi.fn();
  // Test double for the locked read-modify-write, expressed through the mocked read/write.
  const updateEnvValue = async (key: string, updater: (c: string | null) => string | null) =>
    actual.withKeyLock(key, async () => {
      const current = (await getEnvValue(key)) as string | null;
      const next = updater(current);
      if (next !== null && next !== current) await setEnvValue(key, next);
    });
  return { withKeyLock: actual.withKeyLock, getEnvValue, setEnvValue, updateEnvValue };
});

import { getEnvValue, setEnvValue } from "@/lib/vercel-env";
import {
  loadServers,
  saveServers,
  mutateServers,
  toPublic,
  slugifyId,
  validateServerInput,
  _resetServerCache,
  type McpServerConfig,
} from "@/lib/mcp-servers";

const STORED: McpServerConfig = {
  id: "hubspot",
  name: "HubSpot",
  url: "https://hub.example.com/mcp",
  headerName: "Authorization",
  key: "Bearer abc1234",
  builtIn: false,
};

beforeEach(() => {
  _resetServerCache();
  vi.clearAllMocks();
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://po.example.com/mcp");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "po-key-9999");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadServers", () => {
  it("returns the built-in PowerOffice server first, then stored servers", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([STORED]));
    const servers = await loadServers();
    expect(servers).toHaveLength(2);
    expect(servers[0]).toEqual({
      id: "poweroffice",
      name: "PowerOffice",
      url: "https://po.example.com/mcp",
      headerName: "x-functions-key",
      key: "po-key-9999",
      builtIn: true,
    });
    expect(servers[1]).toEqual(STORED);
    expect(getEnvValue).toHaveBeenCalledWith("MCP_SERVERS");
  });

  it("omits the built-in server when PowerOffice env vars are missing", async () => {
    vi.stubEnv("POWEROFFICE_MCP_URL", "");
    vi.mocked(getEnvValue).mockResolvedValue(null);
    expect(await loadServers()).toEqual([]);
  });

  it("ignores malformed stored JSON and entries without required fields", async () => {
    vi.mocked(getEnvValue).mockResolvedValue("not json");
    expect(await loadServers()).toHaveLength(1);
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([{ id: "x" }, STORED]));
    _resetServerCache();
    expect(await loadServers()).toHaveLength(2);
  });

  it("loads stored servers with an empty key and keeps a valid transport", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(
      JSON.stringify([{ ...STORED, key: "", transport: "sse" }, { ...STORED, id: "b", transport: "bogus" }])
    );
    const servers = await loadServers();
    expect(servers[1]).toMatchObject({ id: "hubspot", key: "", transport: "sse" });
    expect(servers[2]).not.toHaveProperty("transport");
  });

  it("marks stored servers as not built-in even if the JSON claims otherwise", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([{ ...STORED, builtIn: true }]));
    const servers = await loadServers();
    expect(servers[1].builtIn).toBe(false);
  });
});

describe("saveServers", () => {
  it("persists only non-built-in servers as JSON in MCP_SERVERS", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(null);
    const builtIn = (await loadServers())[0];
    await saveServers([builtIn, STORED]);
    const { builtIn: _b, ...storedShape } = STORED;
    void _b;
    expect(setEnvValue).toHaveBeenCalledWith("MCP_SERVERS", JSON.stringify([storedShape]));
  });

  it("does not cache the stored list in this module (every load re-reads the env store)", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(null);
    await loadServers();
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([STORED]));
    const servers = await loadServers();
    expect(servers.map((s) => s.id)).toEqual(["poweroffice", "hubspot"]);
    expect(getEnvValue).toHaveBeenCalledTimes(2);
  });
});

describe("mutateServers", () => {
  it("re-reads the latest list inside the lock and writes the mutated result", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([STORED]));
    const other: McpServerConfig = { ...STORED, id: "other", name: "Other" };
    const result = await mutateServers((current) => [...current, other]);
    expect(result.map((s) => s.id)).toEqual(["poweroffice", "hubspot", "other"]);
    const written = JSON.parse(vi.mocked(setEnvValue).mock.calls[0][1] as string) as Array<{ id: string }>;
    expect(written.map((s) => s.id)).toEqual(["hubspot", "other"]);
  });

  it("serializes concurrent mutations so neither update is lost", async () => {
    let stored: string | null = "[]";
    vi.mocked(getEnvValue).mockImplementation(async () => stored);
    vi.mocked(setEnvValue).mockImplementation(async (_k, v) => {
      await new Promise((r) => setTimeout(r, 5));
      stored = v;
    });
    const a: McpServerConfig = { ...STORED, id: "a", name: "A" };
    const b: McpServerConfig = { ...STORED, id: "b", name: "B" };
    await Promise.all([mutateServers((c) => [...c, a]), mutateServers((c) => [...c, b])]);
    const ids = (JSON.parse(stored!) as Array<{ id: string }>).map((s) => s.id);
    expect(ids).toEqual(["a", "b"]);
  });

  it("skips the write when the mutator returns the same list", async () => {
    vi.mocked(getEnvValue).mockResolvedValue(JSON.stringify([STORED]));
    await mutateServers((current) => current);
    expect(setEnvValue).not.toHaveBeenCalled();
  });
});

describe("toPublic", () => {
  it("strips the key and masks it to the last 4 characters", () => {
    const pub = toPublic(STORED);
    expect("key" in pub).toBe(false);
    expect(pub.keyMasked).toBe("••••1234");
    expect(pub).toMatchObject({ id: "hubspot", name: "HubSpot", url: STORED.url, headerName: "Authorization", builtIn: false });
  });

  it("masks short keys fully", () => {
    expect(toPublic({ ...STORED, key: "ab" }).keyMasked).toBe("••••");
  });
  it("reports 'none' when the server has no key and keeps the transport", () => {
    const pub = toPublic({ ...STORED, key: "", transport: "sse" });
    expect(pub.keyMasked).toBe("none");
    expect(pub.transport).toBe("sse");
  });
});

describe("slugifyId", () => {
  it("lowercases, replaces non-alphanumerics with dashes and trims", () => {
    expect(slugifyId("  HubSpot CRM (prod) ")).toBe("hubspot-crm-prod");
  });
  it("caps the slug at 24 characters", () => {
    expect(slugifyId("a".repeat(40))).toHaveLength(24);
  });
  it("returns 'server' for an empty result", () => {
    expect(slugifyId("!!!")).toBe("server");
  });
});

describe("validateServerInput", () => {
  it("accepts a valid https server and defaults headerName", () => {
    const r = validateServerInput({ name: "HubSpot", url: "https://x.example.com/mcp", key: "k" });
    expect(r).toEqual({ ok: true, value: { name: "HubSpot", url: "https://x.example.com/mcp", key: "k", headerName: "x-functions-key" } });
  });
  it("rejects non-https urls", () => {
    expect(validateServerInput({ name: "a", url: "http://x.example.com", key: "k" })).toMatchObject({ ok: false });
    expect(validateServerInput({ name: "a", url: "not a url", key: "k" })).toMatchObject({ ok: false });
  });
  it("rejects an empty name and trims whitespace", () => {
    expect(validateServerInput({ name: " ", url: "https://x.example.com", key: "k" })).toMatchObject({ ok: false, error: expect.stringContaining("name") });
    const r = validateServerInput({ name: " A ", url: " https://x.example.com ", key: " k ", headerName: " X-Key " });
    expect(r).toEqual({ ok: true, value: { name: "A", url: "https://x.example.com", key: "k", headerName: "X-Key" } });
  });
  it("allows an empty or missing key (unauthenticated servers)", () => {
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "" })).toMatchObject({ ok: true, value: { key: "" } });
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "  " })).toMatchObject({ ok: true, value: { key: "" } });
    expect(validateServerInput({ name: "a", url: "https://x.example.com" })).toMatchObject({ ok: true, value: { key: "" } });
  });
  it("accepts transport http or sse and rejects anything else", () => {
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "", transport: "sse" })).toMatchObject({ ok: true, value: { transport: "sse" } });
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "", transport: "http" })).toMatchObject({ ok: true, value: { transport: "http" } });
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "", transport: "grpc" })).toMatchObject({ ok: false, error: expect.stringContaining("Connection type") });
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "" })).not.toHaveProperty("value.transport");
  });
  it("rejects header names with invalid characters", () => {
    expect(validateServerInput({ name: "a", url: "https://x.example.com", key: "k", headerName: "bad header" })).toMatchObject({ ok: false });
  });
});
