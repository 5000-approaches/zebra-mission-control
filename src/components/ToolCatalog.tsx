export type CatalogTool = {
  name: string;
  description: string;
  friendlyName?: string;
  purpose?: string;
};

export type CatalogIntegration = {
  id: string;
  label: string;
  tools: CatalogTool[];
  howToCombine?: string;
  error?: string;
};

type ToolCatalogProps = {
  integrations: CatalogIntegration[];
};

const STATUS_OK = "#16a34a";
const STATUS_ERROR = "#dc2626";

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const end = trimmed.search(/[.!?](\s|$)/);
  return end === -1 ? trimmed : trimmed.slice(0, end + 1);
}

function ToolRow({ serverId, tool }: { serverId: string; tool: CatalogTool }) {
  const title = tool.friendlyName ?? tool.name;
  const purpose = tool.purpose ?? firstSentence(tool.description);
  return (
    <li
      data-testid="integration-tool"
      className="flex flex-col gap-0.5 py-2 text-xs"
      style={{ borderTop: "1px solid var(--page-border)" }}
    >
      <span className="flex items-baseline gap-2 flex-wrap">
        <span className="font-semibold" style={{ color: "var(--page-text)" }}>
          {title}
        </span>
        {title !== tool.name && (
          <code
            className="font-mono text-[11px] px-1 rounded"
            style={{ background: "var(--page-bg)", color: "var(--page-text)", opacity: 0.6 }}
            title={`${serverId}__${tool.name}`}
          >
            {tool.name}
          </code>
        )}
      </span>
      {purpose && (
        <span style={{ color: "var(--page-text)", opacity: 0.65 }}>{purpose}</span>
      )}
    </li>
  );
}

function ServerCard({ integration }: { integration: CatalogIntegration }) {
  const hasError = Boolean(integration.error);
  const count = integration.tools.length;
  return (
    <details
      data-testid="integration-server"
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
    >
      <summary
        className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none list-none"
        style={{ color: "var(--page-text)" }}
      >
        <span
          aria-hidden="true"
          className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ background: hasError ? STATUS_ERROR : STATUS_OK }}
        />
        <span className="font-semibold text-sm flex-1 truncate">{integration.label}</span>
        <span
          className="text-[11px] font-medium px-2 py-0.5 rounded-full"
          style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}
        >
          {hasError ? "unavailable" : `${count} ${count === 1 ? "tool" : "tools"}`}
        </span>
      </summary>
      <div className="px-4 pb-3">
        {hasError && (
          <p className="text-xs py-2" style={{ color: STATUS_ERROR }}>
            {integration.error}
          </p>
        )}
        {!hasError && integration.howToCombine && (
          <p
            className="text-xs rounded-lg px-3 py-2 mb-2"
            style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}
          >
            {integration.howToCombine}
          </p>
        )}
        {!hasError && count === 0 && (
          <p className="text-xs py-2" style={{ color: "var(--page-text)", opacity: 0.5 }}>
            No tools exposed.
          </p>
        )}
        {count > 0 && (
          <ul className="flex flex-col">
            {integration.tools.map((tool) => (
              <ToolRow key={`${integration.id}:${tool.name}`} serverId={integration.id} tool={tool} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/**
 * Presentational, hook-free view of every connected MCP server and its tools,
 * described in plain language. Expand/collapse uses native <details>.
 */
export function ToolCatalog({ integrations }: ToolCatalogProps) {
  if (integrations.length === 0) {
    return (
      <p
        data-testid="integration-tools-list"
        className="text-xs"
        style={{ color: "var(--page-text)", opacity: 0.5 }}
      >
        No MCP servers connected yet — add one under Settings.
      </p>
    );
  }
  return (
    <div data-testid="integration-tools-list" className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {integrations.map((integration) => (
        <ServerCard key={integration.id} integration={integration} />
      ))}
    </div>
  );
}
