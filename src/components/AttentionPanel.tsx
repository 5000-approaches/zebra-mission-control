"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  TrendingDown,
  Activity,
  FolderOpen,
  Users,
  Receipt,
  Clock,
  Mail,
} from "lucide-react";
import type { ForecastApiResponse } from "@/app/api/forecast/route";

type Severity = "warn" | "info";

type LiveAlert = {
  id: string;
  severity: Severity;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  detail: string;
};

type FutureAlert = {
  id: string;
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  title: string;
  detail: string;
  needs: string;
};

const FUTURE_ALERTS: FutureAlert[] = [
  {
    id: "project-over-budget",
    icon: FolderOpen,
    title: "Project over budget",
    detail: "Surface projects whose logged hours × rate has crossed the agreed ceiling.",
    needs: "Needs project-budget + project-actuals tools from Pogo",
  },
  {
    id: "customer-vip-stale",
    icon: Users,
    title: "VIP customer needs a call",
    detail: "Long-standing customer with no recent activity — call before the relationship cools.",
    needs: "Needs customer-activity + last-contact tools from Pogo",
  },
  {
    id: "invoice-overdue",
    icon: Receipt,
    title: "Invoice overdue",
    detail: "Invoices past their due date that haven't been paid yet.",
    needs: "Needs invoice + payment-status tools from Pogo",
  },
  {
    id: "low-utilization",
    icon: Activity,
    title: "Employee under-utilized this week",
    detail: "Anyone whose billable hours dropped below their weekly target.",
    needs: "Needs employee + timesheet tools from Pogo",
  },
  {
    id: "missing-hours",
    icon: Clock,
    title: "Hours not logged",
    detail: "Employees who haven't logged time for the past N days.",
    needs: "Needs time-entry-by-user tool from Pogo",
  },
  {
    id: "quote-pending",
    icon: Mail,
    title: "Sent quote awaiting response",
    detail: "Outgoing quotes that haven't been accepted or rejected after N days.",
    needs: "Needs quotes + quote-status tools from Pogo",
  },
];

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
}

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.round(((a - b) / b) * 100);
}

function deriveAlerts(data: ForecastApiResponse): LiveAlert[] {
  const alerts: LiveAlert[] = [];
  const past = data.months.filter((m) => m.month < data.currentMonth);
  const current = data.months.find((m) => m.month === data.currentMonth);
  const future = data.months.filter((m) => m.month > data.currentMonth);

  const pastTotals = past.map((m) => m.observed);
  const pastAvg =
    pastTotals.length > 0 ? pastTotals.reduce((s, n) => s + n, 0) / pastTotals.length : 0;

  if (
    current &&
    pastAvg > 0 &&
    current.projected === 0 &&
    future.every((f) => f.projected === 0)
  ) {
    alerts.push({
      id: "forecast-unavailable",
      severity: "warn",
      icon: AlertTriangle,
      title: "Forecast data unavailable for current + future months",
      detail: `Past months loaded fine (avg ${fmtCompact(pastAvg)} NOK), but current and forward months returned 0. Try /api/forecast?debug=1 to see raw MCP output.`,
    });
    return alerts;
  }

  if (past.length >= 3) {
    const [a, b, c] = pastTotals.slice(-3);
    const peak = Math.max(a, b, c);
    if (c < a && c < b && peak > 0 && pct(c, peak) <= -10) {
      alerts.push({
        id: "trend-declining",
        severity: "warn",
        icon: TrendingDown,
        title: "Revenue trending down over past 3 months",
        detail: `${fmtCompact(a)} → ${fmtCompact(b)} → ${fmtCompact(c)} NOK (${pct(c, peak)}% from peak). Worth chasing new work.`,
      });
    }
  }

  if (current && pastAvg > 0 && current.projected > 0) {
    const delta = pct(current.projected, pastAvg);
    if (delta <= -15) {
      alerts.push({
        id: "current-low",
        severity: "warn",
        icon: TrendingDown,
        title: `Current month forecast ${delta}% below 3-month average`,
        detail: `Projected ${fmtCompact(current.projected)} NOK vs avg ${fmtCompact(pastAvg)} NOK.`,
      });
    }
  }

  const firstFuture = future[0];
  if (firstFuture && pastAvg > 0 && firstFuture.projected > 0) {
    const delta = pct(firstFuture.projected, pastAvg);
    if (delta <= -20) {
      alerts.push({
        id: "next-thin",
        severity: "warn",
        icon: AlertTriangle,
        title: "Pipeline thinning next month",
        detail: `Next month forecast ${fmtCompact(firstFuture.projected)} NOK is ${delta}% below 3-month average. Time to start prospecting.`,
      });
    }
  }

  const adjMonth = future.find((m) => m.adjustments > 50_000);
  if (adjMonth) {
    alerts.push({
      id: "adjustments-large",
      severity: "info",
      icon: AlertTriangle,
      title: "Forecast adjustments are sizeable",
      detail: `Forward forecast reduced by ${fmtCompact(adjMonth.adjustments)} NOK (e.g. holidays, planned time off).`,
    });
  }

  return alerts;
}

function summarizeNoSignals(data: ForecastApiResponse | null): string {
  if (!data) return "Forecast data is loading.";
  const past = data.months.filter((m) => m.month < data.currentMonth);
  if (past.length === 0) return "Not enough history yet to surface signals.";
  return "All quiet — revenue trend, pipeline, and run rate look normal.";
}

function LiveAlertCard({ alert }: { alert: LiveAlert }) {
  const Icon = alert.icon;
  const accent = alert.severity === "warn" ? "#dc2626" : "var(--accent)";
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
      }}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: alert.severity === "warn" ? "#fee2e2" : "var(--accent-lighter)" }}
      >
        <Icon size={16} style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm" style={{ color: "var(--page-text)" }}>
          {alert.title}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--page-text)", opacity: 0.65 }}>
          {alert.detail}
        </div>
      </div>
    </div>
  );
}

function FutureAlertCard({ alert }: { alert: FutureAlert }) {
  const Icon = alert.icon;
  return (
    <div
      aria-disabled="true"
      className="rounded-xl p-4 flex items-start gap-3 select-none"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
        cursor: "not-allowed",
        opacity: 0.6,
      }}
    >
      <div
        className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: "var(--page-border)" }}
      >
        <Icon size={16} style={{ color: "var(--page-text)", opacity: 0.5 }} />
      </div>
      <div className="min-w-0">
        <div className="font-semibold text-sm" style={{ color: "var(--page-text)" }}>
          {alert.title}
        </div>
        <div className="text-xs mt-1" style={{ color: "var(--page-text)", opacity: 0.65 }}>
          {alert.detail}
        </div>
        <div
          className="text-xs mt-2 font-medium"
          style={{ color: "#db2777" }}
        >
          {alert.needs}
        </div>
      </div>
    </div>
  );
}

export default function AttentionPanel() {
  const [data, setData] = useState<ForecastApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/forecast")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ForecastApiResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const liveAlerts = data ? deriveAlerts(data) : [];

  return (
    <div
      data-testid="attention-panel"
      className="mt-10 rounded-xl p-6"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
      }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--page-text)" }}>
          Needs attention
        </h2>
        <span className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
          Live signals from PowerOffice forecast
        </span>
      </div>

      {loading && (
        <div className="text-sm opacity-50" style={{ color: "var(--page-text)" }}>
          Loading signals…
        </div>
      )}

      {!loading && error && (
        <div
          className="rounded-xl p-3 text-sm"
          style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b" }}
        >
          Couldn&apos;t load forecast data: {error}
        </div>
      )}

      {!loading && !error && liveAlerts.length === 0 && (
        <div className="text-sm opacity-60" style={{ color: "var(--page-text)" }}>
          {summarizeNoSignals(data)}
        </div>
      )}

      {!loading && !error && liveAlerts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {liveAlerts.map((a) => (
            <LiveAlertCard key={a.id} alert={a} />
          ))}
        </div>
      )}

      <div className="mt-8">
        <div
          className="text-xs font-semibold uppercase tracking-widest mb-3"
          style={{ color: "var(--page-text)", opacity: 0.5 }}
        >
          Future signals — pending Pogo tools
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FUTURE_ALERTS.map((a) => (
            <FutureAlertCard key={a.id} alert={a} />
          ))}
        </div>
      </div>
    </div>
  );
}
