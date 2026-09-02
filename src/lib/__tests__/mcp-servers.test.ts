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
  powerOfficeFromEnv,
  _resetServerCache,
  type McpServerConfig,
} from "@/lib/mcp-servers";

const STORED: McpServerConfig = {
  id: "hubspot",
  name: "HubSpot",
  url: "https://hub.example.com/mcp",
  headerName: "Authorization",
  key: "Bearer abc1234",
};

const PO_SEED: McpServerConfig = {
  id: "poweroffice",
  name: "PowerOffice",
  url: "https://po.example.com/mcp",
  headerName: "x-functions-key",
  key: "po-key-9999",
  transport: "http",
};

/** Simulate the env store: MCP_SERVERS holds `servers`, the seed marker holds `marker`. */
function stubStore(servers: string | null, marker: string | null = null) {
  vi.mocked(getEnvValue).mockImplementation(async (key: string) => (key === "MCP_SERVERS" ? servers : marker));
}

function writtenServers(): Array<Record<string, unknown>> {
  const call = vi.mocked(setEnvValue).mock.calls.find(([k]) => k === "MCP_SERVERS");
  return call ? (JSON.parse(call[1] as string) as Array<Record<string, unknown>>) : [];
}

beforeEach(() => {
  _resetServerCache();
  vi.clearAllMocks();
  vi.mocked(setEnvValue).mockReset().mockResolvedValue(undefined);
  vi.mocked(getEnvValue).mockReset().mockResolvedValue(null);
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://po.example.com/mcp");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "po-key-9999");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("powerOfficeFromEnv", () => {
  it("describes the PowerOffice server from the env vars", () => {
    expect(powerOfficeFromEnv()).toEqual(PO_SEED);
  });
  it("returns null without a URL and an empty key without a key", () => {
    vi.stubEnv("POWEROFFICE_MCP_KEY", "");
    expect(powerOfficeFromEnv()).toMatchObject({ key: "" });
    vi.stubEnv("POWEROFFICE_MCP_URL", "");
    expect(powerOfficeFromEnv()).toBeNull();
  });
});

describe("loadServers", () => {
  it("returns the stored list as-is when PowerOffice is already stored", async () => {
    stubStore(JSON.stringify([STORED, { ...PO_SEED, name: "PowerOffice (edited)", url: "https://po2.example.com" }]));
    const servers = await loadServers();
    expect(servers.map((s) => s.id)).toEqual(["hubspot", "poweroffice"]);
    expect(servers[1]).toMatchObject({ name: "PowerOffice (edited)", url: "https://po2.example.com" });
    expect(setEnvValue).not.toHaveBeenCalled();
  });

  it("seeds PowerOffice from the env vars into the stored list once and marks it seeded", async () => {
    stubStore(JSON.stringify([STORED]));
    const servers = await loadServers();
    expect(servers.map((s) => s.id)).toEqual(["poweroffice", "hubspot"]);
    expect(servers[0]).toEqual(PO_SEED);
    expect(writtenServers().map((s) => s.id)).toEqual(["poweroffice", "hubspot"]);
    expect(setEnvValue).toHaveBeenCalledWith("MCP_POWEROFFICE_SEEDED", "1");
  });

  it("does not re-seed after PowerOffice was removed (seed marker set)", async () => {
    stubStore(JSON.stringify([STORED]), "1");
    const servers = await loadServers();
    expect(servers.map((s) => s.id)).toEqual(["hubspot"]);
    expect(setEnvValue).not.toHaveBeenCalled();
  });

  it("still returns the seeded server for this request when persisting fails", async () => {
    stubStore(null);
    vi.mocked(setEnvValue).mockRejectedValue(new Error("VERCEL_ADMIN_TOKEN is not set"));
    const servers = await loadServers();
    expect(servers).toEqual([PO_SEED]);
  });

  it("returns only stored servers when PowerOffice env vars are missing", async () => {
    vi.stubEnv("POWEROFFICE_MCP_URL", "");
    stubStore(JSON.stringify([STORED]));
    expect(await loadServers()).toEqual([STORED]);
    expect(setEnvValue).not.toHaveBeenCalled();
  });

  it("ignores malformed stored JSON and entries without required fields", async () => {
    vi.stubEnv("POWEROFFICE_MCP_URL", "");
    stubStore("not json");
    expect(await loadServers()).toEqual([]);
    stubStore(JSON.stringify([{ id: "x" }, STORED]));
    expect(await loadServers()).toEqual([STORED]);
  });

  it("loads stored servers with an empty key, keeps a valid transport and ignores unknown fields", async () => {
    stubStore(JSON.stringify([{ ...STORED, key: "", transport: "sse", builtIn: true }, { ...STORED, id: "b", transport: "bogus" }]), "1");
    const servers = await loadServers();
    expect(servers[0]).toEqual({ ...STORED, key: "", transport: "sse" });
    expect(servers[1]).not.toHaveProperty("transport");
    expect(servers[0]).not.toHaveProperty("builtIn");
  });
});

describe("saveServers", () => {
  it("persists every server, PowerOffice included, as JSON in MCP_SERVERS", async () => {
    await saveServers([PO_SEED, STORED]);
    expect(setEnvValue).toHaveBeenCalledWith("MCP_SERVERS", JSON.stringify([PO_SEED, STORED]));
  });

  it("does not cache the stored list in this module (every load re-reads the env store)", async () => {
    stubStore(JSON.stringify([PO_SEED]));
    await loadServers();
    stubStore(JSON.stringify([PO_SEED, STORED]));
    const servers = await loadServers();
    expect(servers.map((s) => s.id)).toEqual(["poweroffice", "hubspot"]);
  });
});

describe("mutateServers", () => {
  it("re-reads the latest list inside the lock and writes the mutated result", async () => {
    stubStore(JSON.stringify([PO_SEED, STORED]));
    const other: McpServerConfig = { ...STORED, id: "other", name: "Other" };
    const result = await mutateServers((current) => [...current, other]);
    expect(result.map((s) => s.id)).toEqual(["poweroffice", "hubspot", "other"]);
    expect(writtenServers().map((s) => s.id)).toEqual(["poweroffice", "hubspot", "other"]);
  });

  it("can remove PowerOffice like any other server", async () => {
    stubStore(JSON.stringify([PO_SEED, STORED]));
    const result = await mutateServers((current) => current.filter((s) => s.id !== "poweroffice"));
    expect(result.map((s) => s.id)).toEqual(["hubspot"]);
    expect(writtenServers().map((s) => s.id)).toEqual(["hubspot"]);
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
    stubStore(JSON.stringify([STORED]));
    await mutateServers((current) => current);
    expect(setEnvValue).not.toHaveBeenCalled();
  });
});

describe("toPublic", () => {
  it("strips the key and masks it to the last 4 characters", () => {
    const pub = toPublic(STORED);
    expect("key" in pub).toBe(false);
    expect(pub.keyMasked).toBe("••••1234");
    expect(pub).toEqual({ id: "hubspot", name: "HubSpot", url: STORED.url, headerName: "Authorization", keyMasked: "••••1234" });
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
