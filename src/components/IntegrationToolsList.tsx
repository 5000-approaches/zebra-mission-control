"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ToolsApiResponse, IntegrationTools } from "@/app/api/integrations/tools/route";

type Props = {
  /** Show only this integration. If omitted, render all. */
  filterId?: string;
  /** "header" — collapsible pill suitable for sitting under a page header.
   *  "embedded" — flat list suitable for nesting inside another card. */
  variant?: "header" | "embedded";
};

export default function IntegrationToolsList({ filterId, variant = "header" }: Props) {
  const [data, setData] = useState<ToolsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(variant === "embedded");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/tools")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ToolsApiResponse>;
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

  const integrations = (data?.integrations ?? []).filter(
    (i) => filterId == null || i.id === filterId
  );
  const totalTools = integrations.reduce((n, i) => n + i.tools.length, 0);

  if (variant === "embedded") {
    return (
      <EmbeddedView
        loading={loading}
        error={error}
        integrations={integrations}
        showLabels={filterId == null}
      />
    );
  }

  return (
    <div data-testid="integration-tools-list" className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
        style={{
          background: "var(--page-surface)",
          border: "1px solid var(--page-border)",
          color: "var(--page-text)",
        }}
      >
        <span style={{ opacity: 0.75 }}>
          {loading ? "Loading tools…" : `Available tools (${totalTools})`}
        </span>
        {open ? <ChevronUp size={12} style={{ opacity: 0.5 }} /> : <ChevronDown size={12} style={{ opacity: 0.5 }} />}
      </button>

      {open && (
        <div
          className="mt-2 rounded-lg p-3"
          style={{
            background: "var(--page-surface)",
            border: "1px solid var(--page-border)",
          }}
        >
          <EmbeddedView
            loading={loading}
            error={error}
            integrations={integrations}
            showLabels={filterId == null}
          />
        </div>
      )}
    </div>
  );
}

function EmbeddedView({
  loading,
  error,
  integrations,
  showLabels,
}: {
  loading: boolean;
  error: string | null;
  integrations: IntegrationTools[];
  showLabels: boolean;
}) {
  if (loading) {
    return (
      <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
        Loading tools…
      </p>
    );
  }
  if (error) {
    return (
      <p className="text-xs" style={{ color: "#b91c1c" }}>
        Could not load tools: {error}
      </p>
    );
  }
  if (integrations.length === 0) {
    return (
      <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
        No integrations configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {integrations.map((integ) => (
        <div key={integ.id} className="flex flex-col gap-1.5">
          {showLabels && (
            <p
              className="text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--page-text)", opacity: 0.55 }}
            >
              {integ.label}
            </p>
          )}
          {integ.error ? (
            <p className="text-xs" style={{ color: "#b91c1c" }}>
              {integ.error}
            </p>
          ) : integ.tools.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
              No tools exposed.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {integ.tools.map((t) => (
                <li
                  key={`${integ.id}:${t.name}`}
                  data-testid="integration-tool"
                  className="text-xs flex flex-col"
                >
                  <code
                    className="font-mono"
                    style={{ color: "var(--page-text)" }}
                  >
                    {t.name}
                  </code>
                  {t.description && (
                    <span style={{ color: "var(--page-text)", opacity: 0.55 }}>
                      {t.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
