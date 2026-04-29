"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import type { ForecastApiResponse, ForecastMonth } from "@/app/api/forecast/route";

function fmt(n: number) {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}

function fmtCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatMonthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

type CardKind = "past" | "current" | "future";

function classify(monthYYYYMM: string, currentMonth: string): CardKind {
  if (monthYYYYMM < currentMonth) return "past";
  if (monthYYYYMM === currentMonth) return "current";
  return "future";
}

const EARNED = "var(--accent)";
const FORECAST = "var(--accent-light)";

function MonthCard({ data, kind }: { data: ForecastMonth; kind: CardKind }) {
  const restOfMonth = Math.max(0, data.projected - data.observed);
  const headerLabel =
    kind === "current" ? "Current month" : kind === "future" ? "Forecast" : "Final";
  const bigColor = kind === "future" ? FORECAST : EARNED;

  return (
    <div
      data-testid="month-card"
      className="rounded-2xl p-6 flex flex-col gap-3"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div
          className="text-xs font-semibold uppercase tracking-widest opacity-50"
          style={{ color: "var(--page-text)" }}
        >
          {formatMonthLabel(data.month)}
        </div>
        <div
          className="text-[10px] font-medium uppercase tracking-wider opacity-40"
          style={{ color: "var(--page-text)" }}
        >
          {headerLabel}
        </div>
      </div>
      <div className="text-4xl font-bold" style={{ color: bigColor }}>
        {fmt(data.projected)} <span className="text-lg font-normal opacity-60">NOK</span>
      </div>
      {kind === "current" && (
        <div className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--page-text)" }}>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: EARNED }} />
              <span className="opacity-70">Earned to date</span>
            </span>
            <span className="font-medium">{fmt(data.observed)} NOK</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: FORECAST }} />
              <span className="opacity-70">Forecast — rest of month</span>
            </span>
            <span className="font-medium">{fmt(restOfMonth)} NOK</span>
          </div>
        </div>
      )}
      {kind === "future" && (
        <div className="text-xs opacity-60" style={{ color: "var(--page-text)" }}>
          Not earned yet — extrapolated from this month&apos;s daily run rate, less known
          adjustments.
        </div>
      )}
      {kind === "past" && (
        <div className="text-xs opacity-60" style={{ color: "var(--page-text)" }}>
          Final revenue for the month.
        </div>
      )}
      <div className="text-xs opacity-40 mt-1" style={{ color: "var(--page-text)" }}>
        Calculated {timeAgo(data.calculatedAt)}
      </div>
    </div>
  );
}

function ForecastChart({
  months,
  currentMonth,
}: {
  months: ForecastMonth[];
  currentMonth: string;
}) {
  const maxVal = Math.max(...months.map((m) => Math.max(m.projected, m.observed)), 1);
  const barW = 56;
  const groupW = 110;
  const padTop = 32;
  const padBottom = 40;
  const innerH = 200;
  const chartH = innerH + padTop + padBottom;
  const chartW = months.length * groupW + 40;
  const padLeft = 20;
  const baseY = padTop + innerH;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
    >
      <div className="flex items-center gap-4 mb-4">
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--page-text)", opacity: 0.65 }}
        >
          <div className="w-3 h-3 rounded-sm" style={{ background: EARNED }} />
          Earned
        </div>
        <div
          className="flex items-center gap-1.5 text-xs"
          style={{ color: "var(--page-text)", opacity: 0.65 }}
        >
          <div className="w-3 h-3 rounded-sm" style={{ background: FORECAST }} />
          Forecast (not earned yet)
        </div>
      </div>
      <svg
        width="100%"
        height={chartH}
        viewBox={`0 0 ${chartW} ${chartH}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ overflow: "visible" }}
      >
        {months.map((m, i) => {
          const kind = classify(m.month, currentMonth);
          const totalH = (m.projected / maxVal) * innerH;
          const earnedH = (m.observed / maxVal) * innerH;
          const x = padLeft + i * groupW + (groupW - barW) / 2;
          const monthLabel = new Date(
            parseInt(m.month.split("-")[0]),
            parseInt(m.month.split("-")[1]) - 1,
            1
          ).toLocaleString("en-GB", { month: "short" });
          // Pick the "earned-portion" color. Past months are conceptually all "earned"
          // (final revenue), so use the solid earned color for the entire bar.
          const fullEarnedFill = kind === "past" ? EARNED : EARNED;

          return (
            <g key={m.month}>
              {/* Forecast layer (full projected height) — only used as visible fill
                  when the month has a forecast portion above the earned portion. */}
              {kind !== "past" && (
                <rect
                  x={x}
                  y={baseY - totalH}
                  width={barW}
                  height={totalH}
                  rx={4}
                  fill={FORECAST}
                />
              )}
              {/* Earned overlay (drawn on top up to observed). For past months the
                  observed equals projected, so this fills the whole bar in solid. */}
              {earnedH > 0 && (
                <rect
                  x={x}
                  y={baseY - earnedH}
                  width={barW}
                  height={earnedH}
                  rx={4}
                  fill={fullEarnedFill}
                />
              )}
              {/* Total / projected value above the bar */}
              <text
                x={x + barW / 2}
                y={baseY - totalH - 18}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill="var(--page-text)"
                opacity={0.8}
              >
                {fmtCompact(m.projected)}
              </text>
              {/* Earned sub-label for current month, shown below the projected total */}
              {kind === "current" && earnedH > 0 && m.observed !== m.projected && (
                <text
                  x={x + barW / 2}
                  y={baseY - totalH - 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={500}
                  fill="var(--page-text)"
                  opacity={0.5}
                >
                  earned {fmtCompact(m.observed)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={baseY + 18}
                textAnchor="middle"
                fontSize={11}
                fill="var(--page-text)"
                opacity={0.6}
              >
                {monthLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ForecastInfo({
  months,
  currentMonth,
}: {
  months: ForecastMonth[];
  currentMonth: string;
}) {
  const current = months.find((m) => m.month === currentMonth);
  const firstFuture = months.find((m) => m.month > currentMonth);
  const dailyAverage = current?.dailyAverage ?? 0;
  const adjustments = firstFuture?.adjustments ?? 0;
  const currentMonthName = formatMonthLabel(currentMonth).split(" ")[0];

  return (
    <div
      className="rounded-2xl p-5 text-sm flex flex-col gap-3"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
        color: "var(--page-text)",
      }}
    >
      <div className="font-semibold opacity-80">How this forecast is built</div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="font-medium">Daily run rate · {fmt(dailyAverage)} NOK / day</div>
          <div className="opacity-60 text-xs mt-1">
            Average daily revenue so far this month ({currentMonthName} 1 → today). Used to
            extrapolate the rest of {currentMonthName} and to project the next two months.
          </div>
        </div>
        <div>
          <div className="font-medium">
            Forecast adjustments · −{fmt(adjustments)} NOK
          </div>
          <div className="opacity-60 text-xs mt-1">
            One-off reduction applied to the forward forecast (e.g., known contract endings,
            planned time off, public-holiday weeks). Not applied to past or current-month
            actuals. The same total is shared across the forward window — it isn&apos;t
            multiplied per month.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ForecastPage() {
  const [data, setData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/forecast")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<ForecastApiResponse>;
      })
      .then((d) => setData(d))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-8 md:p-12 max-w-5xl flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--page-text)" }}>
          Forecast
        </h1>
        <p className="text-sm" style={{ color: "var(--page-text)", opacity: 0.55 }}>
          Deterministic revenue forecast — 6-month window with 2 months ahead extrapolated
        </p>
      </div>

      {loading && (
        <div
          className="flex items-center justify-center py-16 opacity-40"
          style={{ color: "var(--page-text)" }}
        >
          Loading…
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}
        >
          {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {data.months.slice(-3).map((m) => (
              <MonthCard key={m.month} data={m} kind={classify(m.month, data.currentMonth)} />
            ))}
          </div>
          <ForecastChart months={data.months} currentMonth={data.currentMonth} />
          <ForecastInfo months={data.months} currentMonth={data.currentMonth} />
        </>
      )}
    </div>
  );
}
