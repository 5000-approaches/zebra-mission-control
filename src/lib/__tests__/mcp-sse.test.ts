import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isSseServer, sseRpc } from "@/lib/mcp-sse";
import { listServerTools, _resetServerToolCache } from "@/lib/mcp-client";
import type { McpServerConfig } from "@/lib/mcp-servers";

const SSE_SERVER: McpServerConfig = {
  id: "gurobot",
  name: "Gurobot",
  url: "https://gurobot.example.com/sse",
  headerName: "x-functions-key",
  key: "",
  builtIn: false,
};

type Sent = { url: string; body: Record<string, unknown> };

/**
 * Fake legacy-SSE server: the GET opens a stream that emits `endpoint`, then a
 * JSON-RPC reply for every POST that carries an id (echoing the id back).
 */
function fakeSseServer(opts: { endpoint?: string; replies?: (req: Record<string, unknown>) => unknown; extraEvents?: string; neverEnd?: boolean } = {}) {
  const sent: Sent[] = [];
  let push: ((chunk: string) => void) | null = null;
  let close: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      push = (chunk) => controller.enqueue(enc.encode(chunk));
      close = () => controller.close();
      if (opts.endpoint !== null) {
        push(`event: endpoint\ndata: ${opts.endpoint ?? "/messages?session=abc"}\n\n`);
      }
      if (opts.extraEvents) push(opts.extraEvents);
    },
  });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || init.method === undefined || init.method === "GET") {
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    sent.push({ url, body });
    if (body.id !== undefined && !opts.neverEnd) {
      const result = opts.replies ? opts.replies(body) : { ok: true };
      // Reply asynchronously, like a real server.
      setTimeout(() => push?.(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\n\n`), 0);
    }
    return new Response(null, { status: 202 });
  });
  return { fetchMock, sent, closeStream: () => close?.() };
}

beforeEach(() => {
  _resetServerToolCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isSseServer", () => {
  it("detects the sse transport flag or a /sse url path", () => {
    expect(isSseServer(SSE_SERVER)).toBe(true);
    expect(isSseServer({ ...SSE_SERVER, url: "https://x.example.com/mcp", transport: "sse" })).toBe(true);
    expect(isSseServer({ ...SSE_SERVER, url: "https://x.example.com/mcp" })).toBe(false);
    expect(isSseServer({ ...SSE_SERVER, transport: "http" })).toBe(false);
  });
});

describe("sseRpc", () => {
  it("opens the stream, resolves a relative endpoint, initializes, then sends the request and returns its reply", async () => {
    const { fetchMock, sent } = fakeSseServer({
      replies: (req) => (req.method === "tools/list" ? { tools: [{ name: "read_admin_doc", description: "Read a doc" }] } : { protocolVersion: "2024-11-05" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await sseRpc(SSE_SERVER, 7, "tools/list", {});

    expect(reply.id).toBe(7);
    expect(reply.result).toEqual({ tools: [{ name: "read_admin_doc", description: "Read a doc" }] });
    expect(sent.map((s) => s.body.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(sent.every((s) => s.url === "https://gurobot.example.com/messages?session=abc")).toBe(true);
    expect(sent[1].body).not.toHaveProperty("id");

    const getInit = fetchMock.mock.calls[0][1] as RequestInit;
    const getHeaders = getInit.headers as Record<string, string>;
    expect(getHeaders.Accept).toBe("text/event-stream");
    expect(getHeaders["bypass-tunnel-reminder"]).toBe("1");
    expect(getHeaders).not.toHaveProperty("x-functions-key");
    expect(getInit.redirect).toBe("error");
  });

  it("sends the auth header when a key is set and accepts an absolute endpoint", async () => {
    const { fetchMock, sent } = fakeSseServer({ endpoint: "https://other.example.com/rpc" });
    vi.stubGlobal("fetch", fetchMock);

    await sseRpc({ ...SSE_SERVER, key: "secret" }, 1, "tools/list", {});

    expect(sent[0].url).toBe("https://other.example.com/rpc");
    const getHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(getHeaders["x-functions-key"]).toBe("secret");
    const postHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(postHeaders["x-functions-key"]).toBe("secret");
  });

  it("ignores unrelated events and replies with other ids while waiting", async () => {
    const { fetchMock } = fakeSseServer({
      extraEvents: `: ping\n\nevent: message\ndata: {"jsonrpc":"2.0","id":999,"result":{"stale":true}}\n\nevent: message\ndata: not json\n\n`,
      replies: () => ({ fine: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await sseRpc(SSE_SERVER, 3, "tools/list", {});
    expect(reply.result).toEqual({ fine: true });
  });

  it("fails clearly when the server never sends an endpoint event", async () => {
    const { fetchMock, closeStream } = fakeSseServer({ endpoint: null as unknown as string, extraEvents: ": hello\n\n" });
    vi.stubGlobal("fetch", fetchMock);
    setTimeout(closeStream, 5);

    await expect(sseRpc(SSE_SERVER, 1, "tools/list", {})).rejects.toThrow(/endpoint/);
  });

  it("times out when the server never replies", async () => {
    const { fetchMock } = fakeSseServer({ neverEnd: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(sseRpc(SSE_SERVER, 1, "tools/list", {}, { timeoutMs: 30 })).rejects.toThrow(/timed out/);
  });

  it("surfaces JSON-RPC errors from the stream", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        const stream = new ReadableStream<Uint8Array>({
          start(c) {
            const enc = new TextEncoder();
            c.enqueue(enc.encode("event: endpoint\ndata: /m\n\n"));
            c.enqueue(enc.encode(`event: message\ndata: {"jsonrpc":"2.0","id":0,"result":{}}\n\n`));
            c.enqueue(enc.encode(`event: message\ndata: {"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"nope"}}\n\n`));
          },
        });
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const reply = await sseRpc(SSE_SERVER, 1, "tools/list", {});
    expect(reply.error).toEqual({ code: -1, message: "nope" });
  });
});

describe("mcp-client routes SSE servers through sseRpc", () => {
  it("lists tools from an SSE server", async () => {
    const { fetchMock } = fakeSseServer({
      replies: (req) => (req.method === "tools/list" ? { tools: [{ name: "search_admin_docs" }] } : {}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const tools = await listServerTools(SSE_SERVER);
    expect(tools).toEqual([{ name: "search_admin_docs", description: "", inputSchema: {} }]);
  });
});
