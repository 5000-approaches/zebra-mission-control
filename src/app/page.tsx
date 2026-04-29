export default function Home() {
  return (
    <div className="p-8 md:p-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--page-text)" }}>
        Hello Mission Control
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--page-text)", opacity: 0.65 }}>
        Project management hub for Zebra Consulting
      </p>

      <div
        className="rounded-xl p-6 mb-6"
        style={{
          background: "var(--page-surface)",
          border: "1px solid var(--page-border)",
        }}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center font-bold text-sm text-white"
            style={{ background: "var(--accent-gradient)" }}
          >
            ZC
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--page-text)" }}>
              Mission Control is online
            </p>
            <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
              Bootstrap deploy verified
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--page-text)", opacity: 0.75 }}>
          This is a bootstrap dummy page. The Slack-style sidebar on the left, dark chrome, and
          accent gradient demonstrate that the design system is wired up. Color schemes
          (zebra-yellow default, plus zebra-blue, cure, dinamo, stacc, digr, stack, kravia) and
          light/dark mode are available via{" "}
          <code
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}
          >
            data-scheme
          </code>{" "}
          and{" "}
          <code
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}
          >
            data-mode
          </code>{" "}
          attributes on the{" "}
          <code
            className="px-1.5 py-0.5 rounded text-xs"
            style={{ background: "var(--accent-lighter)", color: "var(--accent-darker)" }}
          >
            &lt;html&gt;
          </code>{" "}
          element.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--page-text)", opacity: 0.5 }}>
            Stack
          </p>
          <p className="text-sm font-medium" style={{ color: "var(--page-text)" }}>
            Next.js 16 · React 19
          </p>
        </div>
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--page-text)", opacity: 0.5 }}>
            Styling
          </p>
          <p className="text-sm font-medium" style={{ color: "var(--page-text)" }}>
            Tailwind 4 · Geist
          </p>
        </div>
        <div
          className="rounded-lg p-4"
          style={{ background: "var(--page-surface)", border: "1px solid var(--page-border)" }}
        >
          <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "var(--page-text)", opacity: 0.5 }}>
            Tests
          </p>
          <p className="text-sm font-medium" style={{ color: "var(--page-text)" }}>
            Vitest · Playwright
          </p>
        </div>
      </div>
    </div>
  );
}
