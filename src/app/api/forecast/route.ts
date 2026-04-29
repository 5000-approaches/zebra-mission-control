import { listTools, callTool } from "@/lib/poweroffice-mcp";

export type ForecastMonth = {
  month: string;
  observed: number;
  dailyAverage: number;
  projected: number;
  adjustments: number;
  calculatedAt: string;
  /** Present only when ?debug=1 — raw text returned by the MCP `forecast` tool. */
  rawText?: string;
};

export type ForecastApiResponse = {
  months: ForecastMonth[];
  totals: {
    observed: number;
    projected: number;
    adjustments: number;
  };
};

/**
 * 6-month rolling window: 3 months before current, current, 2 months ahead.
 * For 2026-04 this yields [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06].
 */
function getOsloMonths(): string[] {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = parseInt(parts.find((p) => p.type === "year")!.value);
  const month = parseInt(parts.find((p) => p.type === "month")!.value) - 1; // 0-indexed

  return [-3, -2, -1, 0, 1, 2].map((offset) => {
    const m = month + offset;
    const y = year + Math.floor(m / 12);
    const mo = ((m % 12) + 12) % 12 + 1;
    return `${y}-${String(mo).padStart(2, "0")}`;
  });
}

type RawForecastShape = Record<string, unknown>;

function pickNumber(obj: RawForecastShape, ...keys: string[]): number {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const parsed = parseFloat(v.replace(/[,\s]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

export async function GET(req: Request) {
  const apiSecret = process.env.FORECAST_API_SECRET;
  if (apiSecret) {
    const provided = req.headers.get("x-api-secret");
    if (provided !== apiSecret) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

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
  const forecastTool = toolNames.find((n) => n === "forecast");

  if (!forecastTool) {
    return new Response(
      JSON.stringify({
        error: `No forecast tool found. Available tools: ${toolNames.join(", ")}`,
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  const months = getOsloMonths();

  try {
    const results = await Promise.all(
      months.map((month) => callTool("forecast", { month }))
    );

    const forecastMonths: ForecastMonth[] = results.map((result, i) => {
      const text = result.content
        .map((c) => c.text ?? "")
        .join("\n")
        .trim();

      console.log(`[forecast] month=${months[i]} mcp.text=${text.slice(0, 500)}`);

      let data: RawForecastShape = {};
      try {
        data = JSON.parse(text);
      } catch {
        // text wasn't JSON — leave data empty, raw text still surfaced via debug
      }

      // Some MCP servers wrap the payload (e.g. { data: {...} }, { result: {...} })
      const inner = (data.data && typeof data.data === "object" ? data.data : data.result && typeof data.result === "object" ? data.result : data) as RawForecastShape;

      const observed = pickNumber(inner, "observed", "actual", "actualRevenue", "revenueObserved", "revenue", "totalRevenue", "billed");
      const projected = pickNumber(inner, "projected", "forecast", "forecastTotal", "projectedRevenue", "projection", "expected", "total");
      const dailyAverage = pickNumber(inner, "dailyAverage", "avgDaily", "perDay", "dailyAvg");
      const adjustments = pickNumber(inner, "adjustments", "adjustment", "manualAdjustments");

      const calculatedAtRaw = inner.calculatedAt ?? inner.asOf ?? inner.timestamp;
      const calculatedAt =
        typeof calculatedAtRaw === "string" ? calculatedAtRaw : new Date().toISOString();

      const month: ForecastMonth = {
        month: months[i],
        observed,
        dailyAverage,
        projected,
        adjustments,
        calculatedAt,
      };
      if (debug) month.rawText = text;
      return month;
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
