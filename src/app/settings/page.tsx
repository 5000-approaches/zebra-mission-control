"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import IntegrationSkillsList from "@/components/IntegrationSkillsList";

type PoConfig = { url: string; key: string };

function PowerOfficeCard() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PoConfig>({ url: "", key: "" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/settings/integrations/poweroffice")
      .then((r) => r.json())
      .then((d: PoConfig) => setConfig(d));
  }, [open]);

  async function handleSave() {
    setSaving(true);
    await fetch("/api/settings/integrations/poweroffice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        style={{ color: "var(--page-text)" }}
      >
        <div>
          <p className="font-semibold text-base">PowerOffice MCP</p>
          <p className="text-xs mt-0.5" style={{ opacity: 0.55 }}>
            API connection for the forecast agent
          </p>
        </div>
        {open ? <ChevronUp size={18} style={{ opacity: 0.5 }} /> : <ChevronDown size={18} style={{ opacity: 0.5 }} />}
      </button>

      {open && (
        <div
          className="px-6 pb-6 space-y-4 border-t"
          style={{ borderColor: "var(--page-border)" }}
        >
          <div className="pt-4">
            <label className="block text-xs mb-1.5" style={{ color: "var(--page-text)", opacity: 0.65 }}>
              MCP URL
            </label>
            <input
              type="url"
              value={config.url}
              onChange={(e) => setConfig((c) => ({ ...c, url: e.target.value }))}
              placeholder="https://..."
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--page-bg)",
                border: "1px solid var(--page-border)",
                color: "var(--page-text)",
              }}
            />
          </div>

          <div>
            <label className="block text-xs mb-1.5" style={{ color: "var(--page-text)", opacity: 0.65 }}>
              API Key
            </label>
            <input
              type="password"
              value={config.key}
              onChange={(e) => setConfig((c) => ({ ...c, key: e.target.value }))}
              placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--page-bg)",
                border: "1px solid var(--page-border)",
                color: "var(--page-text)",
              }}
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
              style={{ background: "var(--accent)", color: "white" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <p className="text-xs" style={{ color: "#16a34a" }}>
                Saved — update Vercel env vars to apply
              </p>
            )}
          </div>

          <div className="pt-2">
            <p className="text-xs mb-2" style={{ color: "var(--page-text)", opacity: 0.65 }}>
              Available skills
            </p>
            <IntegrationSkillsList filterId="poweroffice" variant="embedded" />
          </div>
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="p-8 md:p-12 max-w-2xl">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--page-text)" }}>
        Settings
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--page-text)", opacity: 0.55 }}>
        Integrations and configuration
      </p>

      <PowerOfficeCard />
    </div>
  );
}
