type AgentHeaderProps = {
  firstName: string;
};

/** Page header for the Zebra Agent. Pure and hook-free so it can be unit-tested directly. */
export function AgentHeader({ firstName }: AgentHeaderProps) {
  return (
    <div>
      <h1 className="text-xl font-bold" style={{ color: "var(--page-text)" }}>
        Hello{firstName && <span style={{ color: "#16a34a" }}> {firstName}</span>}
      </h1>
      <p className="text-sm mt-0.5" style={{ color: "var(--page-text)", opacity: 0.55 }}>
        Zebra Agent — ask questions across the tools connected below
      </p>
    </div>
  );
}
