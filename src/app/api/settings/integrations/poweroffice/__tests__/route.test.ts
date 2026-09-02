import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/api-auth", () => ({ requireSession: vi.fn() }));

import { requireSession } from "@/lib/api-auth";
import { GET, PATCH } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(null);
  vi.stubEnv("VERCEL_ADMIN_TOKEN", "test-token");
});

describe("auth guard", () => {
  it("GET and PATCH return 401 without a session and never touch Vercel", async () => {
    vi.mocked(requireSession).mockResolvedValue(Response.json({ error: "Unauthorized" }, { status: 401 }));
    expect((await GET()).status).toBe(401);
    const req = new Request("http://localhost/", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "x" }) });
    expect((await PATCH(req)).status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/settings/integrations/poweroffice", () => {
  it("returns url and key from Vercel env API", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: "https://mcp.example.com" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: "secret-key" }) });

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ url: "https://mcp.example.com", key: "secret-key" });
  });

  it("returns empty strings when Vercel API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) });

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ url: "", key: "" });
  });

  it("returns empty strings when VERCEL_ADMIN_TOKEN is missing", async () => {
    vi.stubEnv("VERCEL_ADMIN_TOKEN", "");

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ url: "", key: "" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/settings/integrations/poweroffice", () => {
  function makeRequest(body: unknown) {
    return new Request("http://localhost/api/settings/integrations/poweroffice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("updates url and key and returns them", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const res = await PATCH(makeRequest({ url: "https://new.mcp.com", key: "newkey" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ url: "https://new.mcp.com", key: "newkey" });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("updates only url when key is omitted", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const res = await PATCH(makeRequest({ url: "https://new.mcp.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(body.url).toBe("https://new.mcp.com");
  });

  it("returns 500 when Vercel API returns error", async () => {
    mockFetch.mockResolvedValue({ ok: false });

    const res = await PATCH(makeRequest({ url: "x", key: "y" }));
    expect(res.status).toBe(500);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});
