import { getEnvValue, setEnvValue, updateEnvValue } from "./vercel-env";

export type McpTransport = "http" | "sse";

export type McpServerConfig = {
  id: string;
  name: string;
  url: string;
  headerName: string;
  /** Empty string for servers that need no authentication. */
  key: string;
  /** Omitted = auto-detect ("sse" when the URL path ends with /sse, otherwise streamable HTTP). */
  transport?: McpTransport;
};

export type McpServerPublic = Omit<McpServerConfig, "key"> & { keyMasked: string };

export type ServerInput = { name: string; url: string; key?: string; headerName?: string; transport?: string };
export type ValidatedServerInput = { name: string; url: string; key: string; headerName: string; transport?: McpTransport };
export type ValidationResult = { ok: true; value: ValidatedServerInput } | { ok: false; error: string };

/** Id of the PowerOffice server. It is a regular, editable server; this id only drives the forecast lookup and first-run seeding. */
export const POWEROFFICE_ID = "poweroffice";
export const DEFAULT_HEADER_NAME = "x-functions-key";
export const NO_KEY_LABEL = "none";
const STORAGE_KEY = "MCP_SERVERS";
/** Set once the PowerOffice env vars have been copied into the stored list, so a deleted PowerOffice server stays deleted. */
const SEED_MARKER_KEY = "MCP_POWEROFFICE_SEEDED";
const MASK = "••••";
const MAX_SLUG_LENGTH = 24;
const HEADER_NAME_PATTERN = /^[A-Za-z0-9-]+$/;
const TRANSPORTS: readonly McpTransport[] = ["http", "sse"];

function isTransport(v: unknown): v is McpTransport {
  return typeof v === "string" && (TRANSPORTS as readonly string[]).includes(v);
}

/** PowerOffice server described by the legacy env vars, or null when they are not set. */
export function powerOfficeFromEnv(): McpServerConfig | null {
  const url = process.env.POWEROFFICE_MCP_URL;
  if (!url) return null;
  return {
    id: POWEROFFICE_ID,
    name: "PowerOffice",
    url,
    headerName: DEFAULT_HEADER_NAME,
    key: process.env.POWEROFFICE_MCP_KEY ?? "",
    transport: "http",
  };
}

type StoredServer = { id: string; name: string; url: string; headerName: string; key: string; transport?: McpTransport };

function isStoredServer(v: unknown): v is StoredServer {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  const required = ["id", "name", "url", "headerName"].every((f) => typeof o[f] === "string" && (o[f] as string).length > 0);
  return required && typeof o.key === "string";
}

function fromStored(s: StoredServer): McpServerConfig {
  const base: McpServerConfig = { id: s.id, name: s.name, url: s.url, headerName: s.headerName, key: s.key };
  return isTransport(s.transport) ? { ...base, transport: s.transport } : base;
}

function parseStored(raw: string | null): McpServerConfig[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredServer).map(fromStored);
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

function hasPowerOffice(list: McpServerConfig[]): boolean {
  return list.some((s) => s.id === POWEROFFICE_ID);
}

/**
 * Copy the PowerOffice env vars into the stored list exactly once. After that
 * PowerOffice is an ordinary server: editable, removable, and never re-created.
 * If persisting fails the seeded server is still returned for this request.
 */
async function seedPowerOffice(stored: McpServerConfig[]): Promise<McpServerConfig[]> {
  const seed = powerOfficeFromEnv();
  if (!seed) return stored;
  if ((await getEnvValue(SEED_MARKER_KEY)) === "1") return stored;
  try {
    const next = await mutateServers((current) => (hasPowerOffice(current) ? current : [seed, ...current]));
    await setEnvValue(SEED_MARKER_KEY, "1").catch(() => undefined);
    return next;
  } catch {
    return [seed, ...stored];
  }
}

export async function loadServers(): Promise<McpServerConfig[]> {
  const stored = await loadStored();
  if (hasPowerOffice(stored)) return stored;
  return seedPowerOffice(stored);
}

function serialize(list: McpServerConfig[]): string {
  const stored = list.map(({ id, name, url, headerName, key, transport }) => ({
    id,
    name,
    url,
    headerName,
    key,
    ...(transport ? { transport } : {}),
  }));
  return JSON.stringify(stored);
}

export async function saveServers(list: McpServerConfig[]): Promise<void> {
  await setEnvValue(STORAGE_KEY, serialize(list));
}

/**
 * Read-modify-write under the env store's per-key lock (taken exactly once,
 * inside updateEnvValue): the mutator always sees the latest stored list, so
 * concurrent edits in one instance cannot overwrite each other. Cross-instance
 * races remain possible (see vercel-env). Returns the resulting full list.
 * Skips the write when the mutator returns the list unchanged.
 */
export async function mutateServers(
  mutator: (current: McpServerConfig[]) => McpServerConfig[]
): Promise<McpServerConfig[]> {
  let result: McpServerConfig[] = [];
  await updateEnvValue(STORAGE_KEY, (raw) => {
    const current = parseStored(raw);
    const next = mutator(current);
    result = next;
    return next === current ? raw : serialize(next);
  });
  return result;
}

export function toPublic(server: McpServerConfig): McpServerPublic {
  const { key, ...rest } = server;
  if (key.length === 0) return { ...rest, keyMasked: NO_KEY_LABEL };
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
  const transport = input.transport === undefined ? undefined : input.transport.trim();

  if (!name) return { ok: false, error: "A name is required" };
  if (!isHttpsUrl(url)) return { ok: false, error: "The MCP URL must be a valid https:// address" };
  if (!HEADER_NAME_PATTERN.test(headerName)) return { ok: false, error: "The header name may only contain letters, digits and dashes" };
  if (transport !== undefined && !isTransport(transport)) {
    return { ok: false, error: 'Connection type must be "http" or "sse"' };
  }
  const value: ValidatedServerInput = { name, url, key, headerName };
  return { ok: true, value: transport === undefined ? value : { ...value, transport } };
}

/** Kept for callers/tests that reset state between runs; there is no cache to clear anymore. */
export function _resetServerCache(): void {}
