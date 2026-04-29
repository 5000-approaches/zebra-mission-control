import Anthropic from "@anthropic-ai/sdk";
import { callTool, listTools } from "@/lib/poweroffice-mcp";
import type { MessageParam, TextBlockParam, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a billable revenue forecast assistant for Zebra Consulting. Your job is to help answer billing and revenue questions using PowerOffice data.

When a user asks a question:
1. Confirm what they want to know (e.g. "You want a billable forecast for April — correct?")
2. Create a brief plan of what data you'll fetch
3. Ask for any missing details: date range, project codes, employee codes
4. Use the available tools to fetch data from PowerOffice
5. Present results in a structured format with these fields when applicable:
   - Period
   - Observed (actual billed to date)
   - Daily average
   - Projected total
   - Adjustments
   - Calculated at

Always be concise and use numbers in NOK. If data is unavailable, say so clearly.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let messages: ChatMessage[];
  try {
    const body = await req.json();
    messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("messages array is required and must not be empty", { status: 400 });
    }
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const tools = await listTools();
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let conversation: MessageParam[] = messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        // Agentic loop: continue until end_turn (no more tool calls)
        while (true) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 4096,
            system: [
              {
                type: "text",
                text: SYSTEM_PROMPT,
                cache_control: { type: "ephemeral" },
              },
            ],
            messages: conversation,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
            stream: false,
          });

          // Stream text content to client
          for (const block of response.content) {
            if (block.type === "text") {
              controller.enqueue(encoder.encode(block.text));
            }
          }

          if (response.stop_reason === "end_turn") break;

          if (response.stop_reason === "tool_use") {
            const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
            if (toolUseBlocks.length === 0) break;

            // Append assistant turn
            conversation = [
              ...conversation,
              { role: "assistant" as const, content: response.content },
            ];

            // Execute all tool calls and collect results
            const toolResults: ToolResultBlockParam[] = [];
            for (const block of toolUseBlocks) {
              if (block.type !== "tool_use") continue;
              let resultContent: string;
              try {
                const mcpResult = await callTool(
                  block.name,
                  block.input as Record<string, unknown>
                );
                resultContent = mcpResult.content
                  .map((c) => c.text ?? "")
                  .join("\n");
              } catch (err) {
                resultContent = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
              }
              toolResults.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: resultContent,
              });
            }

            // Append user turn with tool results
            const userTurn: MessageParam = {
              role: "user",
              content: toolResults as Array<TextBlockParam | ToolResultBlockParam>,
            };
            conversation = [...conversation, userTurn];

            // Continue the loop for the next assistant response
          } else {
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
