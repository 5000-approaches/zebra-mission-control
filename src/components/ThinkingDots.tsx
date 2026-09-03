/** Animated "agent is thinking" indicator shown while awaiting a reply. */
export function ThinkingDots() {
  return (
    <span
      role="status"
      aria-label="Zebra Agent is thinking"
      data-testid="thinking-indicator"
      className="inline-flex items-center gap-1 py-1"
    >
      <span className="sr-only">Zebra Agent is thinking…</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          data-testid="thinking-dot"
          aria-hidden="true"
          className="inline-block w-2 h-2 rounded-full animate-bounce motion-reduce:animate-none"
          style={{
            background: "var(--page-text)",
            opacity: 0.6,
            animationDelay: `${i * 150}ms`,
          }}
        />
      ))}
    </span>
  );
}
