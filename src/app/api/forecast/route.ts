import { requireSessionOrApiSecret } from "@/lib/api-auth";
import { listTools, callTool } from "@/lib/poweroffice-mcp";
import { toDdMmYyyy } from "@/lib/forecast-dates";
import { parseForecastEnvelope, type ForecastPayload } from "@/lib/forecast-envelope";

export type ForecastMonth = {
  month: string;
  observed: number;
  dailyAverage: number;
  projected: number;
  adjustments: number;
  calculatedAt: string;
  /** Set when this slot could not be computed; observed/projected are then 0. */
  error?: string;
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

const NOT_ENOUGH_DAYS = "Not enough booked days yet this month";

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

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * "Reduced projected revenue by X NOK" / "Reduced projected revenue by 0.00 NOK".
 * Surface the absolute reduction as the adjustments figure.
 */
function extractAdjustments(notes: unknown): number {
  if (typeof notes !== "string" || !notes) return 0;
  const m = notes.match(/Reduced projected revenue by ([\d,.]+)\s*NOK/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type IsoArgs = { from_date: string; to_date: string; forecast_until_date: string };

type CallPlan = {
  kind: "past" | "current" | "future";
  month: string;
  args: IsoArgs;
  /** Reason the slot is skipped without calling the tool. */
  skip?: string;
};

// Past M:    from=M-start, to=M-end,            forecast_until=today        → AnalysisPeriodTotal = actual M revenue
// Current M: from=M-start, to=yesterday,        forecast_until=M-end        → AnalysisPeriodTotal = MTD, ProjectedTotal = full-month estimate
// Future M:  cumulative from current-month-start through M-end; projected M = cumThruM - cumThruPrevM
//
// The MCP requires from_date strictly before to_date, and errors when to_date == today
// (today's entries aren't booked yet), so current/future slots use yesterday. On day 1-2
// of a month that leaves no analysis window, so those slots are skipped with a reason.
function buildPlans(today: OsloDate, months: string[]): CallPlan[] {
  const todayIso = isoDate(today);
  const yesterdayIso = new Date(Date.UTC(today.year, today.month - 1, today.day - 1))
    .toISOString()
    .slice(0, 10);
  const currentMonthStart = `${today.year}-${String(today.month).padStart(2, "0")}-01`;
  const hasAnalysisWindow = yesterdayIso > currentMonthStart;

  return months.map((m): CallPlan => {
    const [yStr, monStr] = m.split("-");
    const y = parseInt(yStr);
    const mon = parseInt(monStr);
    const mStart = `${m}-01`;
    const mEnd = `${m}-${String(lastDayOfMonth(y, mon)).padStart(2, "0")}`;
    const isCurrent = y === today.year && mon === today.month;
    const isFuture = y > today.year || (y === today.year && mon > today.month);

    if (isCurrent || isFuture) {
      return {
        kind: isCurrent ? "current" : "future",
        month: m,
        args: { from_date: currentMonthStart, to_date: yesterdayIso, forecast_until_date: mEnd },
        skip: hasAnalysisWindow ? undefined : NOT_ENOUGH_DAYS,
      };
    }
    return {
      kind: "past",
      month: m,
      args: { from_date: mStart, to_date: mEnd, forecast_until_date: todayIso },
    };
  });
}

function toMcpArgs(args: IsoArgs): Record<string, string> {
  return {
    from_date: toDdMmYyyy(args.from_date),
    to_date: toDdMmYyyy(args.to_date),
    forecast_until_date: toDdMmYyyy(args.forecast_until_date),
  };
}

type SlotResult = {
  plan: CallPlan;
  text: string;
  payload: ForecastPayload;
  error?: string;
};

/** One month slot. A failing call never fails the whole forecast — it becomes `error` on that slot. */
async function runPlan(plan: CallPlan): Promise<SlotResult> {
  if (plan.skip) return { plan, text: "", payload: {}, error: plan.skip };

  try {
    const r = await callTool("forecast", toMcpArgs(plan.args));
    const text = r.content
      .map((c) => c.text ?? "")
      .join("\n")
      .trim();
    const parsed = parseForecastEnvelope(text);
    if (!parsed.ok) return { plan, text, payload: {}, error: parsed.error };
    if (r.isError === true) return { plan, text, payload: {}, error: text.slice(0, 200) || "Tool error" };
    return { plan, text, payload: parsed.payload };
  } catch (err) {
    return { plan, text: "", payload: {}, error: err instanceof Error ? err.message : String(err) };
  }
}

function toMonth(
  r: SlotResult,
  index: number,
  months: string[],
  cumProjectedByMonth: Map<string, number>,
  debug: boolean
): ForecastMonth {
  const { plan, text, payload, error } = r;
  const calculatedAt =
    typeof payload.CalculatedAt === "string" ? payload.CalculatedAt : new Date().toISOString();
  const base: ForecastMonth = {
    month: plan.month,
    observed: 0,
    dailyAverage: num(payload.DailyAverage),
    projected: 0,
    adjustments: extractAdjustments(payload.Notes),
    calculatedAt,
    ...(error ? { error } : {}),
    ...(debug ? { rawText: text } : {}),
  };
  if (error) return base;
  if (plan.kind === "past") {
    const observed = num(payload.AnalysisPeriodTotal);
    return { ...base, observed, projected: observed };
  }
  if (plan.kind === "current") {
    return { ...base, observed: num(payload.AnalysisPeriodTotal), projected: num(payload.ProjectedTotal) };
  }
  const prevCum = cumProjectedByMonth.get(months[index - 1]) ?? 0;
  return { ...base, projected: Math.max(0, num(payload.ProjectedTotal) - prevCum) };
}

function jsonError(error: string, status: number): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request) {
  const denied = await requireSessionOrApiSecret(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const debug = url.searchParams.get("debug") === "1";

  let tools;
  try {
    tools = await listTools();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`MCP tools/list failed: ${msg}`, 502);
  }

  const toolNames = tools.map((t) => t.name);
  if (!toolNames.includes("forecast")) {
    return jsonError(`No forecast tool found. Available tools: ${toolNames.join(", ")}`, 501);
  }

  const today = osloToday();
  const months = getOsloMonths(today);
  const plans = buildPlans(today, months);

  const results = await Promise.all(plans.map(runPlan));

  // Cumulative ProjectedTotals by month for the future-diff computation. The
  // current-month plan's ProjectedTotal doubles as the "through current month" baseline.
  const cumProjectedByMonth = new Map(
    results
      .filter((r) => r.plan.kind !== "past" && !r.error)
      .map((r) => [r.plan.month, num(r.payload.ProjectedTotal)] as const)
  );

  const forecastMonths = results.map((r, i) => toMonth(r, i, months, cumProjectedByMonth, debug));

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
