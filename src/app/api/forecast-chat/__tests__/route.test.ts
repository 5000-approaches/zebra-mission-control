import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock poweroffice-mcp before importing route
vi.mock("@/lib/poweroffice-mcp", () => ({
  listTools: vi.fn().mockResolvedValue([
    {
      name: "getForecast",
      description: "Get billable forecast",
      inputSchema: { type: "object", properties: { month: { type: "string" } } },
    },
  ]),
  callTool: vi.fn().mockResolvedValue({
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

import { POST } from "../route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/forecast-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    const { callTool } = await import("@/lib/poweroffice-mcp");

    anthropicMocks.create
      .mockResolvedValueOnce({
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Let me check that." },
          { type: "tool_use", id: "tu_1", name: "getForecast", input: { month: "2026-04" } },
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
    expect(callTool).toHaveBeenCalledWith("getForecast", { month: "2026-04" });
    expect(anthropicMocks.create).toHaveBeenCalledTimes(2);
  });

  it("returns 400 for missing messages", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty messages array", async () => {
    const res = await POST(makeRequest({ messages: [] }));
    expect(res.status).toBe(400);
  });
});
