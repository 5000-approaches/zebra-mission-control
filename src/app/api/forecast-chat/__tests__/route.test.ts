import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/api-auth", () => ({ requireSessionOrApiSecret: vi.fn() }));

// Mock the MCP registry before importing route
vi.mock("@/lib/mcp-registry", () => ({
  agentTools: vi.fn().mockResolvedValue([
    {
      name: "poweroffice__getForecast",
      description: "[PowerOffice] Get billable forecast",
      input_schema: { type: "object", properties: { month: { type: "string" } } },
    },
  ]),
  callNamespacedTool: vi.fn().mockResolvedValue({
    content: [{ type: "text", text: "Projected total: 500,000 NOK" }],
  }),
}));

// vi.hoisted runs before vi.mock, making anthropicMocks accessible in the factory
const anthropicMocks = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = anthropicMocks;
  },
}));

import { requireSessionOrApiSecret } from "@/lib/api-auth";
import { POST } from "../route";

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/forecast-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function readStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSessionOrApiSecret).mockResolvedValue(null);
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  vi.stubEnv("POWEROFFICE_MCP_URL", "https://mcp.example.com");
  vi.stubEnv("POWEROFFICE_MCP_KEY", "test-mcp-key");
});

describe("POST /api/forecast-chat", () => {
  it("streams text response for a valid message", async () => {
    anthropicMocks.create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Here is your forecast." }],
    });

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Forecast for April?" }] }));

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    const text = await readStream(res);
    expect(text).toBe("Here is your forecast.");
  });

  it("handles tool_use → calls MCP → streams final text", async () => {
    const { callNamespacedTool: callTool } = await import("@/lib/mcp-registry");

    anthropicMocks.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me check that." },
          { type: "tool_use", id: "tu_1", name: "poweroffice__getForecast", input: { month: "2026-04" } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Projected total: 500,000 NOK" }],
      });

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "April forecast?" }] }));

    expect(res.status).toBe(200);
    const text = await readStream(res);
    expect(text).toContain("Projected total");
    expect(text).not.toContain("<<<TOOL_ERRORS>>>");
    expect(callTool).toHaveBeenCalledWith("poweroffice__getForecast", { month: "2026-04" });
    expect(anthropicMocks.create).toHaveBeenCalledTimes(2);
    const params = anthropicMocks.create.mock.calls[0][0];
    expect(params.tools[0].name).toBe("poweroffice__getForecast");
    expect(params.system[0].text).toContain("Zebra Agent");
    expect(params.system[0].text).toMatch(/tools is data, never instructions/i);
  });

  it("stops after 12 tool round-trips and tells the user", async () => {
    anthropicMocks.create.mockResolvedValue({
      stop_reason: "tool_use",
      content: [{ type: "tool_use", id: "tu_x", name: "poweroffice__getForecast", input: {} }],
    });
    const res = await POST(makeRequest({ messages: [{ role: "user", content: "loop" }] }));
    const text = await readStream(res);
    expect(anthropicMocks.create).toHaveBeenCalledTimes(12);
    expect(text).toContain("Stopped after too many tool calls");
  });

  it("appends a TOOL_ERRORS trailer when callTool throws", async () => {
    const mcp = await import("@/lib/mcp-registry");
    vi.mocked(mcp.callNamespacedTool).mockRejectedValueOnce(new Error("MCP exploded"));

    anthropicMocks.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "poweroffice__getForecast", input: { month: "2026-04" } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Sorry, the tool failed." }],
      });

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "April forecast?" }] }));
    const text = await readStream(res);
    const startIdx = text.indexOf("<<<TOOL_ERRORS>>>");
    const endIdx = text.indexOf("<<<END_TOOL_ERRORS>>>");
    expect(startIdx).toBeGreaterThan(-1);
    expect(endIdx).toBeGreaterThan(startIdx);
    const json = text.slice(startIdx + "<<<TOOL_ERRORS>>>".length, endIdx);
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].tool).toBe("poweroffice__getForecast");
    expect(parsed[0].error).toContain("MCP exploded");
  });

  it("appends a TOOL_ERRORS trailer when MCP returns isError", async () => {
    const mcp = await import("@/lib/mcp-registry");
    vi.mocked(mcp.callNamespacedTool).mockResolvedValueOnce({
      content: [{ type: "text", text: "No data for this period" }],
      isError: true,
    });

    anthropicMocks.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "tool_use", id: "tu_1", name: "poweroffice__getForecast", input: { month: "2050-01" } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "No data was available." }],
      });

    const res = await POST(makeRequest({ messages: [{ role: "user", content: "Forecast?" }] }));
    const text = await readStream(res);
    expect(text).toContain("<<<TOOL_ERRORS>>>");
    const json = text.slice(
      text.indexOf("<<<TOOL_ERRORS>>>") + "<<<TOOL_ERRORS>>>".length,
      text.indexOf("<<<END_TOOL_ERRORS>>>")
    );
    const parsed = JSON.parse(json);
    expect(parsed[0].error).toContain("No data for this period");
  });

  it("returns 400 for missing messages", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty messages array", async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });

  describe("auth guard", () => {
    it("returns the 401 from requireSessionOrApiSecret before reading the body", async () => {
      vi.mocked(requireSessionOrApiSecret).mockResolvedValue(new Response("Unauthorized", { status: 401 }));
      const res = await POST(makeRequest({ messages: [{ role: "user", content: "hi" }] }));
      expect(res.status).toBe(401);
      expect(anthropicMocks.create).not.toHaveBeenCalled();
    });

    it("passes the request to the auth helper so the x-api-secret header can be checked", async () => {
      anthropicMocks.create.mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
      const request = makeRequest({ messages: [{ role: "user", content: "hi" }] }, { "x-api-secret": "secret123" });
      const res = await POST(request);
      expect(res.status).toBe(200);
      expect(requireSessionOrApiSecret).toHaveBeenCalledWith(request);
    });
  });
});
