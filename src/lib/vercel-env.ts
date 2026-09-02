/**
 * Read/write Vercel project environment variables at runtime.
 * This is the app's only persistent storage (no database is provisioned).
 *
 * The list endpoint returns CIPHERTEXT for "encrypted" vars even with
 * ?decrypt=true, so it is only used to map key -> id. The decrypted value comes
 * from the per-item endpoint GET /env/{id}.
 *
 * Writes are serialized per key within this process. Two serverless instances
 * can still race each other; that window is accepted for this low-write use.
 */
const DEFAULT_PROJECT_ID = "prj_HZ7O1JQbLkcGcjsOh8KrluX3RG6r";
const CACHE_TTL_MS = 30_000;
const ALL_TARGETS = ["production", "preview", "development"] as const;
const NO_TOKEN_ERROR = "VERCEL_ADMIN_TOKEN is not set — cannot persist settings";

type VercelEnv = { id: string; key: string };
type ListCache = { envs: VercelEnv[]; fetchedAt: number };
type ValueCache = { value: string | null; fetchedAt: number };

let listCache: ListCache | null = null;
const valueCache = new Map<string, ValueCache>();
const locks = new Map<string, Promise<unknown>>();

function projectId(): string {
  return process.env.VERCEL_PROJECT_ID || DEFAULT_PROJECT_ID;
}

function adminToken(): string | null {
  return process.env.VERCEL_ADMIN_TOKEN || null;
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function envUrl(path = ""): string {
  return `https://api.vercel.com/v9/projects/${projectId()}/env${path}`;
}

function isFresh(fetchedAt: number): boolean {
  return Date.now() - fetchedAt < CACHE_TTL_MS;
}

function forget(key: string): void {
  listCache = null;
  valueCache.delete(key);
}

/** Run `task` after any in-flight task for the same key has finished. */
export async function withKeyLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  locks.set(key, run);
  try {
    return await run;
  } finally {
    if (locks.get(key) === run) locks.delete(key);
  }
}

/** Key -> id mapping. Values in this listing are not usable (ciphertext). */
async function listEnvs(token: string, opts: { fresh?: boolean } = {}): Promise<VercelEnv[]> {
  if (!opts.fresh && listCache && isFresh(listCache.fetchedAt)) return listCache.envs;
  const res = await fetch(envUrl(), { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(`Vercel env list failed: ${res.status}`);
  const data = (await res.json()) as { envs?: Array<{ id: string; key: string }> };
  const envs = (data.envs ?? []).map(({ id, key }) => ({ id, key }));
  listCache = { envs, fetchedAt: Date.now() };
  return envs;
}

async function findEnv(token: string, key: string, opts: { fresh?: boolean } = {}): Promise<VercelEnv | undefined> {
  return (await listEnvs(token, opts)).find((e) => e.key === key);
}

/** Decrypted value of one env var, via the per-item endpoint. */
async function readValue(token: string, envId: string): Promise<string | null> {
  const res = await fetch(envUrl(`/${envId}`), { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(`Vercel env read failed: ${res.status}`);
  const data = (await res.json()) as { value?: string };
  return typeof data.value === "string" ? data.value : null;
}

/** Uncached read: fresh listing, then the per-item value. Used inside write locks. */
async function freshRead(token: string, key: string): Promise<string | null> {
  const existing = await findEnv(token, key, { fresh: true });
  if (!existing) return null;
  const value = await readValue(token, existing.id);
  valueCache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

export async function getEnvValue(key: string): Promise<string | null> {
  const token = adminToken();
  if (!token) return process.env[key] ?? null;
  const cached = valueCache.get(key);
  if (cached && isFresh(cached.fetchedAt)) return cached.value;
  const existing = await findEnv(token, key);
  const value = existing ? await readValue(token, existing.id) : null;
  valueCache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

async function writeEnv(token: string, key: string, value: string): Promise<void> {
  const existing = await findEnv(token, key, { fresh: true });
  const res = existing
    ? await fetch(envUrl(`/${existing.id}`), {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ value }),
      })
    : await fetch(`https://api.vercel.com/v10/projects/${projectId()}/env`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ key, value, type: "encrypted", target: [...ALL_TARGETS] }),
      });
  forget(key);
  if (!res.ok) throw new Error(`Vercel env write failed: ${res.status}`);
}

export async function setEnvValue(key: string, value: string): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error(NO_TOKEN_ERROR);
  await withKeyLock(key, () => writeEnv(token, key, value));
}

/**
 * Locked read-modify-write for one key: takes the per-key lock ONCE, reads the
 * freshest value inside it, and writes only when the updater changed it.
 * Callers must not take `withKeyLock` on the same key around this call —
 * the lock is not re-entrant and that would wait on itself forever.
 */
export async function updateEnvValue(
  key: string,
  updater: (current: string | null) => string | null
): Promise<void> {
  const token = adminToken();
  await withKeyLock(key, async () => {
    const current = token ? await freshRead(token, key) : (process.env[key] ?? null);
    const next = updater(current);
    if (next === null || next === current) return;
    if (!token) throw new Error(NO_TOKEN_ERROR);
    await writeEnv(token, key, next);
  });
}

async function removeEnv(token: string, key: string): Promise<void> {
  const existing = await findEnv(token, key, { fresh: true });
  if (!existing) return;
  const res = await fetch(envUrl(`/${existing.id}`), { method: "DELETE", headers: authHeaders(token) });
  forget(key);
  if (!res.ok) throw new Error(`Vercel env delete failed: ${res.status}`);
}

/** Delete a project env var. No-op when the key does not exist. */
export async function deleteEnvValue(key: string): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error(NO_TOKEN_ERROR);
  await withKeyLock(key, () => removeEnv(token, key));
}

export function _resetEnvCache(): void {
  listCache = null;
  valueCache.clear();
}
