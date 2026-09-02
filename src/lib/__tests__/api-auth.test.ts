import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/auth";
import { requireSession, requireSessionOrApiSecret } from "@/lib/api-auth";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BYPASS_AUTH", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("FORECAST_API_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireSession", () => {
  it("returns null when BYPASS_AUTH is true without consulting auth()", async () => {
    vi.stubEnv("BYPASS_AUTH", "true");
    expect(await requireSession()).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  it("ignores BYPASS_AUTH in production", async () => {
    vi.stubEnv("BYPASS_AUTH", "true");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await requireSession();
    expect(res?.status).toBe(401);
    expect(auth).toHaveBeenCalled();
  });

  it("returns null when a session with a user exists", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@zebraconsulting.no" } } as never);
    expect(await requireSession()).toBeNull();
  });

  it("returns a 401 JSON response when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await requireSession();
    expect(res?.status).toBe(401);
    expect(await res!.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 401 when auth() throws", async () => {
    vi.mocked(auth).mockRejectedValue(new Error("boom"));
    const res = await requireSession();
    expect(res?.status).toBe(401);
  });
});

function reqWith(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/x", { headers });
}

describe("requireSessionOrApiSecret", () => {
  it("accepts a matching x-api-secret without consulting auth()", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "s3cret");
    expect(await requireSessionOrApiSecret(reqWith({ "x-api-secret": "s3cret" }))).toBeNull();
    expect(auth).not.toHaveBeenCalled();
  });

  it("falls back to the session when the secret header is wrong or missing", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "s3cret");
    vi.mocked(auth).mockResolvedValue({ user: { email: "a@zebraconsulting.no" } } as never);
    expect(await requireSessionOrApiSecret(reqWith({ "x-api-secret": "wrong" }))).toBeNull();
    expect(await requireSessionOrApiSecret(reqWith())).toBeNull();
    expect(auth).toHaveBeenCalledTimes(2);
  });

  it("returns 401 when neither secret nor session is valid", async () => {
    vi.stubEnv("FORECAST_API_SECRET", "s3cret");
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await requireSessionOrApiSecret(reqWith({ "x-api-secret": "wrong" }));
    expect(res?.status).toBe(401);
  });

  it("requires a session when no secret is configured, even if a header is sent", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await requireSessionOrApiSecret(reqWith({ "x-api-secret": "anything" }));
    expect(res?.status).toBe(401);
  });
});
