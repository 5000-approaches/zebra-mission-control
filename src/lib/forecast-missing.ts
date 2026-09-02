import type { ForecastMonth } from "@/app/api/forecast/route";

export type MissingDataReason = { month: string; label: string; error: string };

function monthLabel(yyyyMM: string): string {
  const [year, month] = yyyyMM.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString("en-GB", { month: "long", year: "numeric" });
}

/** One plain-language line per month whose forecast could not be computed. */
export function missingDataReasons(months: ForecastMonth[]): MissingDataReason[] {
  return months
    .filter((m): m is ForecastMonth & { error: string } => typeof m.error === "string" && m.error.length > 0)
    .map((m) => ({ month: m.month, label: monthLabel(m.month), error: m.error }));
}
