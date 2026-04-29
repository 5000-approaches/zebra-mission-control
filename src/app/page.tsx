"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { MessageSquare, BarChart2 } from "lucide-react";

export const NAV_BOXES = [
  { href: "/agent", label: "Forecast Agent", icon: MessageSquare, description: "Chat with the AI forecast agent" },
  { href: "/forecast", label: "Forecast", icon: BarChart2, description: "Deterministic revenue forecast" },
];

export default function Home() {
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div className="p-8 md:p-12 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8" style={{ color: "var(--page-text)" }}>
        Hello{firstName && (
          <span style={{ color: "#16a34a" }}> {firstName}</span>
        )}
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {NAV_BOXES.map(({ href, label, icon: Icon, description }) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl p-6 transition-colors group block"
            style={{
              background: "var(--page-surface)",
              border: "1px solid var(--page-border)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--page-border)"; }}
          >
            <div className="flex items-center gap-3 mb-2">
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center"
                style={{ background: "var(--accent-lighter)" }}
              >
                <Icon size={18} style={{ color: "var(--accent)" }} />
              </div>
              <p className="font-semibold text-base" style={{ color: "var(--page-text)" }}>
                {label}
              </p>
            </div>
            <p className="text-sm" style={{ color: "var(--page-text)", opacity: 0.6 }}>
              {description}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
