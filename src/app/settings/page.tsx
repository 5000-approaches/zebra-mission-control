"use client";

import { useState } from "react";
import { McpServersPanel } from "@/components/McpServersPanel";
import { McpServersCard } from "@/components/McpServersCard";

export default function SettingsPage() {
  const [toolsRefreshKey, setToolsRefreshKey] = useState(0);
  return (
    <div className="p-8 md:p-12 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--page-text)" }}>
        Settings
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--page-text)", opacity: 0.55 }}>
        Integrations and configuration
      </p>

      <div className="flex flex-col gap-4">
        <McpServersCard onChanged={() => setToolsRefreshKey((k) => k + 1)} />
        <div>
          <p className="text-xs mb-2" style={{ color: "var(--page-text)", opacity: 0.65 }}>
            Everything the Zebra Agent can use right now
          </p>
          <McpServersPanel refreshKey={toolsRefreshKey} />
        </div>
      </div>
    </div>
  );
}
