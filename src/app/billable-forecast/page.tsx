"use client";

export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type ForecastRow = {
  user: string;
  project: string;
  customer: string;
  week: string;
  hours: number;
  rate: number;
  revenue: number;
  status: "committed" | "projected" | "at-risk" | "unbilled";
};

type FilterOptions = {
  users: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  customers: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
};

type SortKey = keyof ForecastRow;
type SortDir = "asc" | "desc";

const STATUS_STYLES: Record<ForecastRow["status"], { bg: string; text: string; label: string }> = {
  committed: { bg: "#d1fae5", text: "#065f46", label: "Committed" },
  projected: { bg: "#dbeafe", text: "#1e40af", label: "Projected" },
  "at-risk": { bg: "#fed7aa", text: "#9a3412", label: "At-risk" },
  unbilled: { bg: "#f3f4f6", text: "#374151", label: "Unbilled" },
};

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function quarterEnd(): string {
  const d = new Date();
  const month = d.getMonth();
  const qEnd = new Date(d.getFullYear(), Math.ceil((month + 1) / 3) * 3, 0);
  return qEnd.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toLocaleString("nb-NO", { maximumFractionDigits: 0 });
}

// Multi-select dropdown
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: Array<{ id: string; name: string }>;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors"
        style={{
          background: "var(--page-surface)",
          border: "1px solid var(--page-border)",
          color: "var(--page-text)",
        }}
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {label}
        {selected.length > 0 && (
          <span
            className="ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {selected.length}
          </span>
        )}
        <span className="text-xs opacity-50">▾</span>
      </button>
      {open && (
        <div
          className="absolute z-20 mt-1 rounded-lg shadow-lg border min-w-[180px] py-1"
          style={{
            background: "var(--page-surface)",
            border: "1px solid var(--page-border)",
          }}
        >
          {options.length === 0 && (
            <p className="px-3 py-2 text-xs opacity-50" style={{ color: "var(--page-text)" }}>
              No options
            </p>
          )}
          {options.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:opacity-80"
              style={{ color: "var(--page-text)" }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt.id)}
                onChange={() => toggle(opt.id)}
                className="rounded"
              />
              {opt.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// KPI card
function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-1"
      style={{
        background: "var(--page-surface)",
        border: "1px solid var(--page-border)",
      }}
    >
      <p className="text-xs font-medium opacity-50" style={{ color: "var(--page-text)" }}>
        {label}
      </p>
      <p className="text-2xl font-bold" style={{ color: "var(--page-text)" }}>
        {value}
      </p>
      {sub && (
        <p className="text-xs opacity-40" style={{ color: "var(--page-text)" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

export default function BillableForecastPage() {
  return (
    <Suspense>
      <BillableForecastContent />
    </Suspense>
  );
}

function BillableForecastContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Read filters from URL
  const [selectedUsers, setSelectedUsers] = useState<string[]>(() =>
    searchParams.get("user")?.split(",").filter(Boolean) ?? []
  );
  const [selectedProjects, setSelectedProjects] = useState<string[]>(() =>
    searchParams.get("project")?.split(",").filter(Boolean) ?? []
  );
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>(() =>
    searchParams.get("customer")?.split(",").filter(Boolean) ?? []
  );
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>(() =>
    searchParams.get("department")?.split(",").filter(Boolean) ?? []
  );
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(() =>
    searchParams.get("status")?.split(",").filter(Boolean) ?? []
  );
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("dateTo") ?? "");

  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    users: [],
    projects: [],
    customers: [],
    departments: [],
  });
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [summary, setSummary] = useState({
    totalHours: 0,
    totalRevenue: 0,
    utilization: 0,
    atRiskRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sync URL on filter change
  const syncUrl = useCallback(
    (overrides?: Record<string, string[]>) => {
      const p = new URLSearchParams();
      const users = overrides?.user ?? selectedUsers;
      const projects = overrides?.project ?? selectedProjects;
      const customers = overrides?.customer ?? selectedCustomers;
      const departments = overrides?.department ?? selectedDepartments;
      const statuses = overrides?.status ?? selectedStatuses;
      const from = overrides?.dateFrom?.[0] ?? dateFrom;
      const to = overrides?.dateTo?.[0] ?? dateTo;
      if (users.length) p.set("user", users.join(","));
      if (projects.length) p.set("project", projects.join(","));
      if (customers.length) p.set("customer", customers.join(","));
      if (departments.length) p.set("department", departments.join(","));
      if (statuses.length) p.set("status", statuses.join(","));
      if (from) p.set("dateFrom", from);
      if (to) p.set("dateTo", to);
      router.replace(`/billable-forecast?${p.toString()}`);
    },
    [selectedUsers, selectedProjects, selectedCustomers, selectedDepartments, selectedStatuses, dateFrom, dateTo, router]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams();
    if (selectedUsers.length) p.set("user", selectedUsers.join(","));
    if (selectedProjects.length) p.set("project", selectedProjects.join(","));
    if (selectedCustomers.length) p.set("customer", selectedCustomers.join(","));
    if (selectedDepartments.length) p.set("department", selectedDepartments.join(","));
    if (selectedStatuses.length) p.set("status", selectedStatuses.join(","));
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    try {
      const res = await fetch(`/api/billable-forecast?${p.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setFilterOptions(data.filters ?? { users: [], projects: [], customers: [], departments: [] });
      setRows(data.rows ?? []);
      setSummary(
        data.summary ?? { totalHours: 0, totalRevenue: 0, utilization: 0, atRiskRevenue: 0 }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedUsers, selectedProjects, selectedCustomers, selectedDepartments, selectedStatuses, dateFrom, dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sortedRows = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    return sortDir === "asc" ? as.localeCompare(bs) : bs.localeCompare(as);
  });

  function applyDatePreset(days: number | "quarter") {
    const from = new Date().toISOString().slice(0, 10);
    const to = days === "quarter" ? quarterEnd() : todayPlus(days as number);
    setDateFrom(from);
    setDateTo(to);
    syncUrl({ dateFrom: [from], dateTo: [to] });
  }

  const COLS: Array<{ key: SortKey; label: string }> = [
    { key: "user", label: "User" },
    { key: "project", label: "Project" },
    { key: "customer", label: "Customer" },
    { key: "week", label: "Week" },
    { key: "hours", label: "Hours" },
    { key: "rate", label: "Rate" },
    { key: "revenue", label: "Revenue" },
    { key: "status", label: "Status" },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--page-bg)" }}>
      {/* Header */}
      <div
        className="px-6 py-5 border-b flex-shrink-0"
        style={{ borderColor: "var(--page-border)" }}
      >
        <h1 className="text-xl font-bold" style={{ color: "var(--page-text)" }}>
          Billable Forecast
        </h1>
        <p className="text-sm mt-0.5 opacity-55" style={{ color: "var(--page-text)" }}>
          Deterministic view of billable hours and revenue
        </p>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <MultiSelect
            label="User"
            options={filterOptions.users}
            selected={selectedUsers}
            onChange={(v) => { setSelectedUsers(v); syncUrl({ user: v }); }}
          />
          <MultiSelect
            label="Project"
            options={filterOptions.projects}
            selected={selectedProjects}
            onChange={(v) => { setSelectedProjects(v); syncUrl({ project: v }); }}
          />
          <MultiSelect
            label="Customer"
            options={filterOptions.customers}
            selected={selectedCustomers}
            onChange={(v) => { setSelectedCustomers(v); syncUrl({ customer: v }); }}
          />
          <MultiSelect
            label="Department"
            options={filterOptions.departments}
            selected={selectedDepartments}
            onChange={(v) => { setSelectedDepartments(v); syncUrl({ department: v }); }}
          />

          {/* Date presets */}
          <div className="flex gap-1.5 flex-wrap">
            {(
              [
                { label: "Next 30d", value: 30 },
                { label: "Next 60d", value: 60 },
                { label: "Next 90d", value: 90 },
                { label: "This quarter", value: "quarter" },
              ] as const
            ).map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyDatePreset(preset.value)}
                className="px-3 py-1.5 rounded-lg text-sm border transition-colors"
                style={{
                  background: "var(--page-surface)",
                  border: "1px solid var(--page-border)",
                  color: "var(--page-text)",
                }}
                data-testid={`preset-${preset.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {preset.label}
              </button>
            ))}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); syncUrl({ dateFrom: [e.target.value] }); }}
              className="px-2 py-1.5 rounded-lg text-sm border"
              style={{
                background: "var(--page-surface)",
                border: "1px solid var(--page-border)",
                color: "var(--page-text)",
              }}
              data-testid="date-from"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); syncUrl({ dateTo: [e.target.value] }); }}
              className="px-2 py-1.5 rounded-lg text-sm border"
              style={{
                background: "var(--page-surface)",
                border: "1px solid var(--page-border)",
                color: "var(--page-text)",
              }}
              data-testid="date-to"
            />
          </div>

          {/* Status chips */}
          <div className="flex gap-1.5 flex-wrap" data-testid="status-filters">
            {(["committed", "projected", "at-risk", "unbilled"] as const).map((s) => {
              const active = selectedStatuses.includes(s);
              const style = STATUS_STYLES[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const next = active
                      ? selectedStatuses.filter((x) => x !== s)
                      : [...selectedStatuses, s];
                    setSelectedStatuses(next);
                    syncUrl({ status: next });
                  }}
                  className="px-3 py-1.5 rounded-lg text-sm border font-medium transition-opacity"
                  style={
                    active
                      ? { background: style.bg, color: style.text, border: "1px solid transparent" }
                      : {
                          background: "var(--page-surface)",
                          border: "1px solid var(--page-border)",
                          color: "var(--page-text)",
                          opacity: 0.6,
                        }
                  }
                  data-testid={`status-chip-${s}`}
                >
                  {style.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label="Total Hours"
            value={fmt(summary.totalHours)}
            sub="billable hours"
          />
          <KpiCard
            label="Total Revenue"
            value={`NOK ${fmt(summary.totalRevenue)}`}
            sub="projected"
          />
          <KpiCard
            label="Utilization"
            value={`${summary.utilization}%`}
            sub="billable / available"
          />
          <KpiCard
            label="At-risk Revenue"
            value={`NOK ${fmt(summary.atRiskRevenue)}`}
            sub="needs attention"
          />
        </div>

        {/* Table */}
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

        {!loading && !error && (
          <div
            className="rounded-xl border overflow-hidden"
            style={{ border: "1px solid var(--page-border)" }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "var(--page-surface)", borderBottom: "1px solid var(--page-border)" }}>
                    {COLS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-4 py-3 text-left font-semibold cursor-pointer select-none whitespace-nowrap"
                        style={{
                          color: "var(--page-text)",
                          position: "sticky",
                          top: 0,
                          background: "var(--page-surface)",
                        }}
                        data-testid={`col-header-${col.key}`}
                      >
                        {col.label}
                        {sortKey === col.key && (
                          <span className="ml-1 opacity-60">{sortDir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={COLS.length}
                        className="px-4 py-8 text-center opacity-40"
                        style={{ color: "var(--page-text)" }}
                      >
                        No data
                      </td>
                    </tr>
                  )}
                  {sortedRows.map((row, i) => {
                    const chip = STATUS_STYLES[row.status];
                    return (
                      <tr
                        key={i}
                        style={{
                          borderBottom: "1px solid var(--page-border)",
                          background: i % 2 === 0 ? "var(--page-bg)" : "var(--page-surface)",
                        }}
                      >
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--page-text)" }}>{row.user}</td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--page-text)" }}>{row.project}</td>
                        <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--page-text)" }}>{row.customer}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: "var(--page-text)" }}>{row.week}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--page-text)" }}>{fmt(row.hours)}</td>
                        <td className="px-4 py-3 text-right tabular-nums" style={{ color: "var(--page-text)" }}>{fmt(row.rate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium" style={{ color: "var(--page-text)" }}>{fmt(row.revenue)}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-semibold"
                            style={{ background: chip.bg, color: chip.text }}
                          >
                            {chip.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
