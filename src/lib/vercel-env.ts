/**
 * Read/write Vercel project environment variables at runtime.
 * This is the app's only persistent storage (no database is provisioned).
 *
 * Writes are serialized per key within this process. Two serverless instances
 * can still race each other; that window is accepted for this low-write use.
 */
const DEFAULT_PROJECT_ID = "prj_HZ7O1JQbLkcGcjsOh8KrluX3RG6r";
const CACHE_TTL_MS = 30_000;
const ALL_TARGETS = ["production", "preview", "development"] as const;
const NO_TOKEN_ERROR = "VERCEL_ADMIN_TOKEN is not set — cannot persist settings";

type VercelEnv = { id: string; key: string; value?: string };
type EnvCache = { envs: VercelEnv[]; fetchedAt: number };

let cache: EnvCache | null = null;
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

async function listEnvs(token: string, opts: { fresh?: boolean } = {}): Promise<VercelEnv[]> {
  if (!opts.fresh && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.envs;
  const res = await fetch(`${envUrl()}?decrypt=true`, { headers: authHeaders(token), cache: "no-store" });
  if (!res.ok) throw new Error(`Vercel env list failed: ${res.status}`);
  const data = (await res.json()) as { envs?: VercelEnv[] };
  const envs = data.envs ?? [];
  cache = { envs, fetchedAt: Date.now() };
  return envs;
}

export async function getEnvValue(key: string): Promise<string | null> {
  const token = adminToken();
  if (!token) return process.env[key] ?? null;
  const envs = await listEnvs(token);
  const match = envs.find((e) => e.key === key);
  return match?.value ?? null;
}

async function writeEnv(token: string, key: string, value: string): Promise<void> {
  const existing = (await listEnvs(token, { fresh: true })).find((e) => e.key === key);
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
  cache = null;
  if (!res.ok) throw new Error(`Vercel env write failed: ${res.status}`);
}

export async function setEnvValue(key: string, value: string): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error(NO_TOKEN_ERROR);
  await withKeyLock(key, () => writeEnv(token, key, value));
}

async function removeEnv(token: string, key: string): Promise<void> {
  const existing = (await listEnvs(token, { fresh: true })).find((e) => e.key === key);
  if (!existing) return;
  const res = await fetch(envUrl(`/${existing.id}`), { method: "DELETE", headers: authHeaders(token) });
  cache = null;
  if (!res.ok) throw new Error(`Vercel env delete failed: ${res.status}`);
}

/** Delete a project env var. No-op when the key does not exist. */
export async function deleteEnvValue(key: string): Promise<void> {
  const token = adminToken();
  if (!token) throw new Error(NO_TOKEN_ERROR);
  await withKeyLock(key, () => removeEnv(token, key));
}

export function _resetEnvCache(): void {
  cache = null;
}
