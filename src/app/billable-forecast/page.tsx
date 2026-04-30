"use client";

import { LineChart } from "lucide-react";

export default function BillableForecastPage() {
  return (
    <main
      className="min-h-screen flex flex-col"
      style={{ background: "var(--page-bg)", color: "var(--page-text)" }}
    >
      <div className="px-6 py-6 border-b" style={{ borderColor: "var(--page-border)" }}>
        <h1 className="text-xl font-semibold">Billable Forecast</h1>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: "var(--page-surface)" }}
        >
          <LineChart size={28} style={{ color: "var(--page-text)", opacity: 0.4 }} />
        </div>
        <p className="text-lg font-medium" style={{ opacity: 0.5 }}>Coming soon</p>
      </div>
    </main>
  );
}
