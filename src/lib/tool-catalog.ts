import Anthropic from "@anthropic-ai/sdk";
import { getEnvValue, setEnvValue } from "./vercel-env";
import type { McpServerConfig } from "./mcp-servers";
import type { McpTool } from "./mcp-client";

export type ToolSummary = { name: string; friendlyName: string; purpose: string };

export type ServerCatalog = {
  serverId: string;
  generatedAt: string;
  toolNames: string[];
  tools: ToolSummary[];
  howToCombine: string;
  /** Set when Claude could not produce summaries and the first-sentence fallback was used. */
  generationError?: string;
};

const CATALOG_MODEL = "claude-opus-5";
const MAX_TOKENS = 4096;

const CATALOG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tools", "howToCombine"],
  properties: {
    tools: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "friendlyName", "purpose"],
        properties: {
          name: { type: "string" },
          friendlyName: { type: "string" },
          purpose: { type: "string" },
        },
      },
    },
    howToCombine: { type: "string" },
  },
} as const;

export function catalogEnvKey(serverId: string): string {
  return `MCP_CATALOG_${serverId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  return match ? match[0] : trimmed;
}

function toolNamesOf(tools: McpTool[]): string[] {
  return tools.map((t) => t.name);
}

export function fallbackCatalog(server: McpServerConfig, tools: McpTool[]): ServerCatalog {
  return {
    serverId: server.id,
    generatedAt: new Date().toISOString(),
    toolNames: toolNamesOf(tools),
    tools: tools.map((t) => ({ name: t.name, friendlyName: t.name, purpose: firstSentence(t.description) })),
    howToCombine: "",
  };
}

function buildPrompt(server: McpServerConfig, tools: McpTool[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  return [
    `These are the tools an AI assistant can use from the "${server.name}" service.`,
    "For each tool write a short friendly name and ONE plain-language sentence explaining what a business user gets from it. No jargon, no parameter names.",
    "Then write one or two sentences on how someone could combine these tools to answer real questions.",
    "Keep every tool's technical name exactly as given.",
    "",
    list,
  ].join("\n");
}

type GeneratedShape = { tools?: Array<Partial<ToolSummary>>; howToCombine?: string };

function mergeGenerated(server: McpServerConfig, tools: McpTool[], generated: GeneratedShape): ServerCatalog {
  const fallback = fallbackCatalog(server, tools);
  const byName = new Map((generated.tools ?? []).map((t) => [t.name, t]));
  const merged = fallback.tools.map((fb) => {
    const g = byName.get(fb.name);
    return {
      name: fb.name,
      friendlyName: g?.friendlyName?.trim() || fb.friendlyName,
      purpose: g?.purpose?.trim() || fb.purpose,
    };
  });
  return { ...fallback, tools: merged, howToCombine: (generated.howToCombine ?? "").trim() };
}

async function askClaude(server: McpServerConfig, tools: McpTool[]): Promise<GeneratedShape> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: CATALOG_MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low", format: { type: "json_schema", schema: CATALOG_SCHEMA } },
    messages: [{ role: "user", content: buildPrompt(server, tools) }],
  });
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return JSON.parse(text) as GeneratedShape;
}

async function persist(catalog: ServerCatalog): Promise<void> {
  try {
    await setEnvValue(catalogEnvKey(catalog.serverId), JSON.stringify(catalog));
  } catch {
    // Persisting is best-effort; the catalog is still returned to the caller.
  }
}

export async function generateCatalog(server: McpServerConfig, tools: McpTool[]): Promise<ServerCatalog> {
  if (tools.length === 0) return fallbackCatalog(server, tools);
  let generated: GeneratedShape;
  try {
    generated = await askClaude(server, tools);
  } catch (err) {
    const generationError = err instanceof Error ? err.message : String(err);
    return { ...fallbackCatalog(server, tools), generationError };
  }
  const catalog = mergeGenerated(server, tools, generated);
  await persist(catalog);
  return catalog;
}

function isCatalog(v: unknown): v is ServerCatalog {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.serverId === "string" && Array.isArray(o.toolNames) && Array.isArray(o.tools) && typeof o.howToCombine === "string";
}

function sameNames(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((n, i) => n === [...b].sort()[i]);
}

async function readStored(server: McpServerConfig): Promise<ServerCatalog | null> {
  try {
    const raw = await getEnvValue(catalogEnvKey(server.id));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isCatalog(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getCatalog(server: McpServerConfig, tools: McpTool[]): Promise<ServerCatalog> {
  const stored = await readStored(server);
  if (stored && sameNames(stored.toolNames, toolNamesOf(tools))) return stored;
  return generateCatalog(server, tools);
}
