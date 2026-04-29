import { listTools, callTool } from "@/lib/poweroffice-mcp";

export type ForecastMonth = {
  month: string;
  observed: number;
  dailyAverage: number;
  projected: number;
  adjustments: number;
  calculatedAt: string;
};

export type ForecastApiResponse = {
  months: ForecastMonth[];
  totals: {
    observed: number;
    projected: number;
    adjustments: number;
  };
};

function getOsloMonths(): string[] {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1; // 0-indexed

  return [0, 1, 2].map((offset) => {
    const m = month + offset;
    const y = year + Math.floor(m / 12);
    const mo = (m % 12) + 1;
    return `${y}-${String(mo).padStart(2, "0")}`;
  });
}

export async function GET(req: Request) {
  const apiSecret = process.env.FORECAST_API_SECRET;
  if (apiSecret) {
    const provided = req.headers.get("x-api-secret");
    if (provided !== apiSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let tools;
  try {
    tools = await listTools();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `MCP tools/list failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const toolNames = tools.map((t) => t.name);
  const forecastTool = toolNames.find((n) => n === "getForecast");

  if (!forecastTool) {
    return new Response(
      JSON.stringify({
        error: `No getForecast tool found. Available tools: ${toolNames.join(", ")}`,
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  const months = getOsloMonths();

  try {
    const results = await Promise.all(
      months.map((month) => callTool("getForecast", { month }))
    );

    const forecastMonths: ForecastMonth[] = results.map((result, i) => {
      const text = result.content[0].text ?? "{}";
      const data = JSON.parse(text);
      return {
        month: months[i],
        observed: data.observed ?? 0,
        dailyAverage: data.dailyAverage ?? 0,
        projected: data.projected ?? 0,
        adjustments: data.adjustments ?? 0,
        calculatedAt: data.calculatedAt ?? new Date().toISOString(),
      };
    });

    const totals = {
      observed: forecastMonths.reduce((s, m) => s + m.observed, 0),
      projected: forecastMonths.reduce((s, m) => s + m.projected, 0),
      adjustments: forecastMonths.reduce((s, m) => s + m.adjustments, 0),
    };

    const response: ForecastApiResponse = { months: forecastMonths, totals };
    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `MCP call failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
