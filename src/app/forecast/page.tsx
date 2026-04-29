"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import type { ForecastApiResponse, ForecastMonth } from "@/app/api/forecast/route";

function fmt(n: number) {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
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

function MonthCard({ data }: { data: ForecastMonth }) {
  return (
    <div
      data-testid="month-card"
      className="rounded-2xl p-6 flex flex-col gap-3"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-widest opacity-50" style={{ color: "var(--page-text)" }}>
        {formatMonthLabel(data.month)}
      </div>
      <div className="text-4xl font-bold" style={{ color: "var(--accent)" }}>
        {fmt(data.projected)} <span className="text-lg font-normal opacity-60">NOK</span>
      </div>
      <div className="flex flex-col gap-1.5 text-sm" style={{ color: "var(--page-text)" }}>
        <div className="flex justify-between">
          <span className="opacity-60">Observed to date</span>
          <span className="font-medium">{fmt(data.observed)} NOK</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-60">Daily average</span>
          <span className="font-medium">{fmt(data.dailyAverage)} NOK</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-60">Adjustments</span>
          <span className="font-medium">{fmt(data.adjustments)} NOK</span>
        </div>
      </div>
      <div className="text-xs opacity-40 mt-1" style={{ color: "var(--page-text)" }}>
        Calculated {timeAgo(data.calculatedAt)}
      </div>
    </div>
  );
}

function ForecastChart({ months }: { months: ForecastMonth[] }) {
  const maxVal = Math.max(...months.flatMap((m) => [m.projected, m.observed]), 1);
  const barW = 48;
  const groupW = 120;
  const chartH = 180;
  const chartW = months.length * groupW + 40;
  const padLeft = 20;
  const padBottom = 40;
  const innerH = chartH - padBottom;

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
    >
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--page-text)", opacity: 0.6 }}>
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--page-border)" }} />
          Projected
        </div>
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--page-text)", opacity: 0.6 }}>
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent)" }} />
          Observed
        </div>
      </div>
      <svg width={chartW} height={chartH} style={{ overflow: "visible" }}>
        {months.map((m, i) => {
          const projH = (m.projected / maxVal) * innerH;
          const obsH = (m.observed / maxVal) * innerH;
          const x = padLeft + i * groupW + (groupW - barW) / 2;
          return (
            <g key={m.month}>
              <rect
                x={x}
                y={innerH - projH}
                width={barW}
                height={projH}
                rx={4}
                fill="var(--page-border)"
              />
              <rect
                x={x}
                y={innerH - obsH}
                width={barW}
                height={obsH}
                rx={4}
                fill="var(--accent)"
                opacity={0.85}
              />
              <text
                x={x + barW / 2}
                y={innerH + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--page-text)"
                opacity={0.55}
              >
                {new Date(parseInt(m.month.split("-")[0]), parseInt(m.month.split("-")[1]) - 1, 1)
                  .toLocaleString("en-GB", { month: "short" })}
              </text>
            </g>
          );
        })}
      </svg>
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
        <div className="flex items-center justify-center py-16 opacity-40" style={{ color: "var(--page-text)" }}>
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

      {!loading && !error && data && (() => {
        // 6-month window: split into 4 historical-or-current and 2 future for cards.
        // Last 3 (current + next 2) shown as detail cards; chart shows all 6.
        const cardMonths = data.months.slice(-3);
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {cardMonths.map((m) => (
                <MonthCard key={m.month} data={m} />
              ))}
            </div>
            <ForecastChart months={data.months} />
          </>
        );
      })()}
    </div>
  );
}
