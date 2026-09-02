"use client";

import { useEffect, useState } from "react";
import { ToolCatalog, type CatalogIntegration } from "./ToolCatalog";

type ToolsResponse = { integrations: CatalogIntegration[] };

type McpServersPanelProps = {
  /** Show only this server; omit to show all. */
  filterId?: string;
  /** Bump to refetch (e.g. after a server was added). */
  refreshKey?: number;
};

/** Fetches the connected MCP servers and their tools, then renders the catalog. */
export function McpServersPanel({ filterId, refreshKey = 0 }: McpServersPanelProps) {
  // Stale-while-revalidate: the last successful data stays on screen while a
  // refetch (new refreshKey) is in flight; only the very first load shows "Loading".
  const [result, setResult] = useState<{ data?: ToolsResponse; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/tools")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ToolsResponse>;
      })
      .then((data) => {
        if (!cancelled) setResult({ data });
      })
      .catch((e: Error) => {
        if (!cancelled) setResult((prev) => ({ data: prev?.data, error: e.message }));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const error = result?.error ?? null;
  const data = result?.data ?? null;

  if (error && !data) {
    return (
      <p className="text-xs" style={{ color: "#b91c1c" }}>
        Could not load tools: {error}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
        Loading tools…
      </p>
    );
  }
  const integrations = data.integrations.filter((i) => filterId == null || i.id === filterId);
  return <ToolCatalog integrations={integrations} />;
}
