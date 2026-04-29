export default function TestPage() {
  return (
    <div className="p-8 md:p-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--page-text)" }}>
        Hello from the pipeline
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--page-text)", opacity: 0.65 }}>
        Pipeline smoke test — end-to-end delivery confirmed
      </p>

      <div
        className="rounded-xl p-6"
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
            ✓
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: "var(--page-text)" }}>
              Pipeline is working
            </p>
            <p className="text-xs" style={{ color: "var(--page-text)", opacity: 0.5 }}>
              Planner → Coder → Tester → Reviewer → Security
            </p>
          </div>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--page-text)", opacity: 0.75 }}>
          This page was shipped by the automated agent pipeline. If you can read this, the full
          delivery chain — from Notion task to deployed code — is operational.
        </p>
      </div>
    </div>
  );
}
