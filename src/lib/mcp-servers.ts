import { getEnvValue, setEnvValue, withKeyLock } from "./vercel-env";

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  headerName: string;
  key: string;
  builtIn: boolean;
};

export type McpServerPublic = Omit<McpServerConfig, "key"> & { keyMasked: string };

export type ServerInput = { name: string; url: string; key: string; headerName?: string };
export type ValidatedServerInput = { name: string; url: string; key: string; headerName: string };
export type ValidationResult = { ok: true; value: ValidatedServerInput } | { ok: false; error: string };

export const BUILT_IN_ID = "poweroffice";
export const DEFAULT_HEADER_NAME = "x-functions-key";
const STORAGE_KEY = "MCP_SERVERS";
const MASK = "••••";
const MAX_SLUG_LENGTH = 24;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;

function builtInServer(): McpServerConfig | null {
  const url = process.env.POWEROFFICE_MCP_URL;
  const key = process.env.POWEROFFICE_MCP_KEY;
  if (!url || !key) return null;
  return { id: BUILT_IN_ID, name: "PowerOffice", url, headerName: DEFAULT_HEADER_NAME, key, builtIn: true };
}

function isStoredServer(v: unknown): v is Omit<McpServerConfig, "builtIn"> {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return ["id", "name", "url", "headerName", "key"].every((f) => typeof o[f] === "string" && (o[f] as string).length > 0);
}

function parseStored(raw: string | null): McpServerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredServer).map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      headerName: s.headerName,
      key: s.key,
      builtIn: false,
    }));
  } catch {
    return [];
  }
}

// No module-level cache here: vercel-env already caches reads for 30s and
// drops that cache on every write, so edits become visible in this instance
// immediately and in other instances within the TTL.
async function loadStored(): Promise<McpServerConfig[]> {
  return parseStored(await getEnvValue(STORAGE_KEY));
}

export async function loadServers(): Promise<McpServerConfig[]> {
  const builtIn = builtInServer();
  const stored = await loadStored();
  return builtIn ? [builtIn, ...stored] : stored;
}

function serialize(list: McpServerConfig[]): string {
  const stored = list
    .filter((s) => !s.builtIn)
    .map(({ id, name, url, headerName, key }) => ({ id, name, url, headerName, key }));
  return JSON.stringify(stored);
}

export async function saveServers(list: McpServerConfig[]): Promise<void> {
  await setEnvValue(STORAGE_KEY, serialize(list));
}

/**
 * Read-modify-write under an in-process lock: the mutator always sees the
 * latest stored list, so concurrent edits in one instance cannot overwrite
 * each other. Cross-instance races remain possible (see vercel-env).
 * Returns the resulting full list (built-in first). Skips the write when the
 * mutator returns the list unchanged.
 */
export async function mutateServers(
  mutator: (current: McpServerConfig[]) => McpServerConfig[]
): Promise<McpServerConfig[]> {
  return withKeyLock(STORAGE_KEY, async () => {
    const current = await loadServers();
    const next = mutator(current);
    if (next !== current) await setEnvValue(STORAGE_KEY, serialize(next));
    return next;
  });
}

export function toPublic(server: McpServerConfig): McpServerPublic {
  const { key, ...rest } = server;
  const tail = key.length > 4 ? key.slice(-4) : "";
  return { ...rest, keyMasked: `${MASK}${tail}` };
}

export function slugifyId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
  return slug || "server";
}

function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateServerInput(input: ServerInput): ValidationResult {
  const name = (input.name ?? "").trim();
  const url = (input.url ?? "").trim();
  const key = (input.key ?? "").trim();
  const headerName = (input.headerName ?? "").trim() || DEFAULT_HEADER_NAME;

  if (!name) return { ok: false, error: "A name is required" };
  if (!isHttpsUrl(url)) return { ok: false, error: "The MCP URL must be a valid https:// address" };
  if (!key) return { ok: false, error: "An API key is required" };
  if (!HEADER_NAME_PATTERN.test(headerName)) return { ok: false, error: "The header name may only contain letters, digits and dashes" };
  return { ok: true, value: { name, url, key, headerName } };
}

/** Kept for callers/tests that reset state between runs; there is no cache to clear anymore. */
export function _resetServerCache(): void {}
