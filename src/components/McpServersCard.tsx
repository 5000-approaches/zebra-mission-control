"use client";

import { useCallback, useEffect, useState, FormEvent } from "react";
import { RefreshCw, Trash2, Pencil, Plus } from "lucide-react";

export type McpTransportOption = "" | "http" | "sse";

export type McpServerView = {
  id: string;
  name: string;
  url: string;
  headerName: string;
  builtIn: boolean;
  keyMasked: string;
  transport?: "http" | "sse";
};

type ServerForm = { name: string; url: string; headerName: string; key: string; transport: McpTransportOption };

const EMPTY_FORM: ServerForm = { name: "", url: "", headerName: "x-functions-key", key: "", transport: "" };
const NO_KEY = "none";

const TRANSPORT_OPTIONS: Array<{ value: McpTransportOption; label: string }> = [
  { value: "", label: "Auto-detect" },
  { value: "http", label: "Standard (HTTP)" },
  { value: "sse", label: "SSE stream (older MCP servers)" },
];

/** Omit an empty transport so the server auto-detects; omit an empty key on edit so the stored one is kept. */
function toRequestBody(form: ServerForm, editing: boolean): Record<string, string | undefined> {
  return {
    name: form.name,
    url: form.url,
    headerName: form.headerName,
    key: editing ? form.key || undefined : form.key,
    transport: form.transport || undefined,
  };
}

const inputStyle = {
  background: "var(--page-bg)",
  border: "1px solid var(--page-border)",
  color: "var(--page-text)",
} as const;

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `HTTP ${res.status}`;
}

function Field({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs mb-1" style={{ color: "var(--page-text)", opacity: 0.65 }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={type === "password" ? "off" : undefined}
        className="w-full rounded-lg px-3 py-2 text-sm outline-none"
        style={inputStyle}
      />
    </label>
  );
}

function ServerForm({
  initial,
  editing,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: ServerForm;
  editing: boolean;
  busy: boolean;
  onSubmit: (form: ServerForm) => void;
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ServerForm>(initial);
  const set = (key: keyof ServerForm) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="mcp-server-form">
      <Field label="Friendly name" value={form.name} onChange={set("name")} placeholder="e.g. HubSpot" />
      <Field label="MCP URL" type="url" value={form.url} onChange={set("url")} placeholder="https://…" />
      <Field label="Header name" value={form.headerName} onChange={set("headerName")} placeholder="x-functions-key" />
      <Field
        label={editing ? "API key or password (optional, leave blank to keep)" : "API key or password (optional)"}
        type="password"
        value={form.key}
        onChange={set("key")}
        placeholder="leave empty if the server needs none"
      />
      <label className="block sm:col-span-2">
        <span className="block text-xs mb-1" style={{ color: "var(--page-text)", opacity: 0.65 }}>
          Connection type
        </span>
        <select
          value={form.transport}
          onChange={(e) => set("transport")(e.target.value as McpTransportOption)}
          className="w-full sm:w-auto rounded-lg px-3 py-2 text-sm outline-none"
          style={inputStyle}
          data-testid="mcp-transport-select"
        >
          {TRANSPORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="block text-[11px] mt-1" style={{ color: "var(--page-text)", opacity: 0.5 }}>
          Auto-detected when the URL ends with /sse.
        </span>
      </label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40"
          style={{ background: "var(--accent)", color: "white" }}
        >
          {busy ? "Working…" : editing ? "Save changes" : "Add and scan tools"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm" style={{ color: "var(--page-text)", opacity: 0.6 }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function ServerRow({
  server,
  busy,
  onEdit,
  onRefresh,
  onRemove,
}: {
  server: McpServerView;
  busy: boolean;
  onEdit: () => void;
  onRefresh: () => void;
  onRemove: () => void;
}) {
  const iconBtn = "p-1.5 rounded-lg disabled:opacity-40";
  return (
    <li
      data-testid="mcp-server-row"
      className="flex items-center gap-3 py-3"
      style={{ borderTop: "1px solid var(--page-border)", color: "var(--page-text)" }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold flex items-center gap-2">
          {server.name}
          {server.builtIn && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}>
              built-in
            </span>
          )}
        </p>
        <p className="text-xs truncate" style={{ opacity: 0.55 }}>
          {server.url}
        </p>
        <p className="text-[11px] font-mono" style={{ opacity: 0.45 }}>
          {server.keyMasked === NO_KEY ? "no key" : `${server.headerName}: ${server.keyMasked}`}
          {server.transport === "sse" && " · SSE"}
        </p>
      </div>
      <button type="button" title="Refresh tools" aria-label="Refresh tools" onClick={onRefresh} disabled={busy} className={iconBtn} style={{ opacity: 0.7 }}>
        <RefreshCw size={14} />
      </button>
      {!server.builtIn && (
        <>
          <button type="button" title="Edit" aria-label="Edit" onClick={onEdit} disabled={busy} className={iconBtn} style={{ opacity: 0.7 }}>
            <Pencil size={14} />
          </button>
          <button type="button" title="Remove" aria-label="Remove" onClick={onRemove} disabled={busy} className={iconBtn} style={{ color: "#b91c1c" }}>
            <Trash2 size={14} />
          </button>
        </>
      )}
    </li>
  );
}

type Props = { onChanged?: () => void };

/** Settings card: list, add, edit, refresh and remove MCP servers. */
export function McpServersCard({ onChanged }: Props) {
  const [servers, setServers] = useState<McpServerView[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/mcp-servers")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res));
        return res.json() as Promise<{ servers: McpServerView[] }>;
      })
      .then((body) => {
        if (!cancelled) setServers(body.servers);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setServers([]);
        setMessage({ kind: "error", text: `Could not load servers: ${err.message}` });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function run(work: () => Promise<string>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await work();
      setMessage({ kind: "ok", text });
      load();
      onChanged?.();
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(form: ServerForm) {
    run(async () => {
      const res = await fetch("/api/mcp-servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequestBody(form, false)),
      });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { server: McpServerView; tools: unknown[]; error?: string };
      setAdding(false);
      if (body.error) return `${body.server.name} saved, but scanning its tools failed: ${body.error}`;
      return `${body.server.name} added — ${body.tools.length} tools found. They are live on the Zebra Agent page.`;
    });
  }

  function handleEdit(id: string, form: ServerForm) {
    run(async () => {
      const res = await fetch(`/api/mcp-servers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toRequestBody(form, true)),
      });
      if (!res.ok) throw new Error(await readError(res));
      setEditingId(null);
      return "Saved.";
    });
  }

  function handleRefresh(server: McpServerView) {
    run(async () => {
      const res = await fetch(`/api/mcp-servers/${server.id}/refresh`, { method: "POST" });
      if (!res.ok) throw new Error(await readError(res));
      const body = (await res.json()) as { tools: unknown[]; error?: string };
      if (body.error) throw new Error(`${server.name}: ${body.error}`);
      return `${server.name}: ${body.tools.length} tools found.`;
    });
  }

  function handleRemove(server: McpServerView) {
    if (!window.confirm(`Remove ${server.name}? Its tools disappear from the Zebra Agent.`)) return;
    run(async () => {
      const res = await fetch(`/api/mcp-servers/${server.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await readError(res));
      return `${server.name} removed.`;
    });
  }

  const editing = servers?.find((s) => s.id === editingId) ?? null;

  return (
    <div
      data-testid="mcp-servers-card"
      className="rounded-xl px-6 py-5 flex flex-col gap-4"
      style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
    >
      <div>
        <h2 className="font-semibold text-base" style={{ color: "var(--page-text)" }}>
          MCP servers
        </h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--page-text)", opacity: 0.55 }}>
          Each server you add is scanned for its tools; they appear on the Zebra Agent page right away.
        </p>
      </div>

      {servers === null ? (
        <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>Loading…</p>
      ) : (
        <ul className="flex flex-col">
          {servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              busy={busy}
              onEdit={() => { setEditingId(server.id); setAdding(false); }}
              onRefresh={() => handleRefresh(server)}
              onRemove={() => handleRemove(server)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <ServerForm
          key={editing.id}
          initial={{ name: editing.name, url: editing.url, headerName: editing.headerName, key: "", transport: editing.transport ?? "" }}
          editing
          busy={busy}
          onSubmit={(form) => handleEdit(editing.id, form)}
          onCancel={() => setEditingId(null)}
        />
      )}

      {adding ? (
        <ServerForm initial={EMPTY_FORM} editing={false} busy={busy} onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => { setAdding(true); setEditingId(null); }}
          className="self-start inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--accent)", color: "white" }}
        >
          <Plus size={14} /> Add MCP server
        </button>
      )}

      {message && (
        <p data-testid="mcp-servers-message" role="status" className="text-xs" style={{ color: message.kind === "ok" ? "#16a34a" : "#b91c1c" }}>
          {message.text}
        </p>
      )}
    </div>
  );
}
