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
  /** Oslo-local current month as YYYY-MM. Lets the UI classify past/current/future without re-deriving timezone. */
  currentMonth: string;
  totals: {
    observed: number;
    projected: number;
    adjustments: number;
  };
};

type OsloDate = { year: number; month: number; day: number };

function osloToday(): OsloDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return {
    year: parseInt(parts.find((p) => p.type === "year")!.value),
    month: parseInt(parts.find((p) => p.type === "month")!.value),
    day: parseInt(parts.find((p) => p.type === "day")!.value),
  };
}

function isoDate({ year, month, day }: OsloDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 6-month rolling window: 3 historical + current + 2 future. For 2026-04 this
 * yields [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06].
 */
function getOsloMonths(today: OsloDate): string[] {
  return [-3, -2, -1, 0, 1, 2].map((offset) => {
    const m = today.month - 1 + offset; // 0-indexed math
    const y = today.year + Math.floor(m / 12);
    const mo = ((m % 12) + 12) % 12 + 1;
    return `${y}-${String(mo).padStart(2, "0")}`;
  });
}

type ForecastPayload = {
  AnalysisPeriodTotal?: number;
  ProjectedTotal?: number;
  DailyAverage?: number;
  Notes?: string;
  CalculatedAt?: string;
};

function parsePayload(text: string): ForecastPayload {
  try {
    return JSON.parse(text) as ForecastPayload;
  } catch {
    return {};
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * "Reduced projected revenue by X NOK" / "Reduced projected revenue by 0.00 NOK".
 * Surface the absolute reduction as the adjustments figure.
 */
function extractAdjustments(notes: string | undefined): number {
  if (!notes) return 0;
  const m = notes.match(/Reduced projected revenue by ([\d,.]+)\s*NOK/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
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
  if (!toolNames.includes("forecast")) {
    return new Response(
      JSON.stringify({
        error: `No forecast tool found. Available tools: ${toolNames.join(", ")}`,
      }),
      { status: 501, headers: { "Content-Type": "application/json" } }
    );
  }

  const today = osloToday();
  const todayIso = isoDate(today);
  const months = getOsloMonths(today);

  // Build the call plan. The MCP `forecast` tool requires forecast_until_date >= to_date,
  // so we use different argument shapes for past, current, and future months.
  // Past M:    from=M-1, to=M-end, forecast_until=today      → AnalysisPeriodTotal = actual M revenue
  // Current M: from=M-1, to=today, forecast_until=M-end      → AnalysisPeriodTotal = MTD, ProjectedTotal = full-month estimate
  // Future M:  cumulative from current month start through M-end; projected M = cumThruM - cumThruPrevM
  //
  // For 6 months we issue: 3 past + 1 current + 2 future-cumulative = 6 calls in parallel.
  // The current-month call doubles as the "cumulative through current month" baseline.

  const currentMonthStart = `${today.year}-${String(today.month).padStart(2, "0")}-01`;

  type CallPlan =
    | { kind: "past"; month: string; args: Record<string, string> }
    | { kind: "current"; month: string; args: Record<string, string> }
    | { kind: "future"; month: string; args: Record<string, string> };

  const plans: CallPlan[] = months.map((m): CallPlan => {
    const [yStr, monStr] = m.split("-");
    const y = parseInt(yStr);
    const mon = parseInt(monStr);
    const mStart = `${m}-01`;
    const mEnd = `${m}-${String(lastDayOfMonth(y, mon)).padStart(2, "0")}`;
    const isCurrent = y === today.year && mon === today.month;
    const isFuture = y > today.year || (y === today.year && mon > today.month);

    if (isCurrent) {
      return {
        kind: "current",
        month: m,
        args: { from_date: mStart, to_date: todayIso, forecast_until_date: mEnd },
      };
    }
    if (isFuture) {
      // Cumulative from current-month-start through this month's end
      return {
        kind: "future",
        month: m,
        args: { from_date: currentMonthStart, to_date: todayIso, forecast_until_date: mEnd },
      };
    }
    return {
      kind: "past",
      month: m,
      args: { from_date: mStart, to_date: mEnd, forecast_until_date: todayIso },
    };
  });

  let results;
  try {
    results = await Promise.all(
      plans.map(async (plan) => {
        const r = await callTool("forecast", plan.args);
        const text = r.content
          .map((c) => c.text ?? "")
          .join("\n")
          .trim();
        console.log(
          `[forecast] month=${plan.month} kind=${plan.kind} args=${JSON.stringify(plan.args)} text=${text.slice(0, 300)}`
        );
        return { plan, text, isError: r.isError === true, payload: parsePayload(text) };
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: `MCP call failed: ${msg}` }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Index cumulative ProjectedTotals by month for the future-diff computation.
  // The current-month plan's ProjectedTotal also serves as the baseline ("through current month").
  const cumProjectedByMonth = new Map<string, number>();
  for (const r of results) {
    if (r.plan.kind === "current" || r.plan.kind === "future") {
      cumProjectedByMonth.set(r.plan.month, num(r.payload.ProjectedTotal));
    }
  }

  const forecastMonths: ForecastMonth[] = results.map((r, i) => {
    const { plan, text, payload, isError } = r;
    const calculatedAt =
      typeof payload.CalculatedAt === "string"
        ? payload.CalculatedAt
        : new Date().toISOString();
    const dailyAverage = num(payload.DailyAverage);
    const adjustments = extractAdjustments(payload.Notes);

    let observed = 0;
    let projected = 0;

    if (isError) {
      // Tool errored for this slot — leave zeros, raw text surfaces via debug
    } else if (plan.kind === "past") {
      // Past full month: observed = AnalysisPeriodTotal; projected equals it (no extrapolation).
      observed = num(payload.AnalysisPeriodTotal);
      projected = observed;
    } else if (plan.kind === "current") {
      observed = num(payload.AnalysisPeriodTotal); // MTD
      projected = num(payload.ProjectedTotal); // full-month forecast
    } else {
      // Future: projected = cumulative through this month - cumulative through prior month.
      // The prior cumulative is either the previous future month's plan or the current month's plan.
      const prevMonth = months[i - 1];
      const prevCum = cumProjectedByMonth.get(prevMonth) ?? 0;
      const thisCum = num(payload.ProjectedTotal);
      projected = Math.max(0, thisCum - prevCum);
      observed = 0;
    }

    const month: ForecastMonth = {
      month: plan.month,
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

  const currentMonth = `${today.year}-${String(today.month).padStart(2, "0")}`;
  const response: ForecastApiResponse = { months: forecastMonths, currentMonth, totals };
  return new Response(JSON.stringify(response), {
    headers: { "Content-Type": "application/json" },
  });
}
