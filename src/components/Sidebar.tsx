"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Home, Settings, X, LogOut, MessageSquare, BarChart2, LineChart } from "lucide-react";
import DeployBadge from "./DeployBadge";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  badge?: string;
};

type NavSection = {
  heading: string | null;
  items: NavItem[];
};

export const NAV_SECTIONS: NavSection[] = [
  {
    heading: null,
    items: [{ href: "/", label: "Home", icon: Home }],
  },
  {
    heading: "Workspace",
    items: [
      { href: "/agent", label: "Forecast Agent", icon: MessageSquare },
      { href: "/forecast", label: "Forecast", icon: BarChart2 },
      { href: "/billable-forecast", label: "Billable Forecast", icon: LineChart, disabled: true, badge: "Soon" },
    ],
  },
  {
    heading: "Admin",
    items: [{ href: "/settings", label: "Settings", icon: Settings }],
  },
];

function NavLink({
  item,
  active,
  onClose,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
}) {
  const { href, label, icon: Icon, disabled, badge } = item;
  return (
    <Link
      href={href}
      onClick={disabled ? (e) => e.preventDefault() : onClose}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: active ? "var(--sidebar-active-bg)" : "transparent",
        color: disabled ? "rgba(255,255,255,0.3)" : active ? "#ffffff" : "rgba(255,255,255,0.65)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "default" : undefined,
        pointerEvents: disabled ? "none" : undefined,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.background = "var(--sidebar-hover)";
          e.currentTarget.style.color = "#ffffff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active && !disabled) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.65)";
        }
      }}
    >
      <Icon size={16} className="flex-shrink-0" />
      <span className="flex-1">{label}</span>
      {badge && (
        <span
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none"
          style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.5)" }}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-[240px] flex flex-col z-50 transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0`}
        style={{ background: "var(--sidebar-bg)" }}
      >
        {/* Logo */}
        <div className="px-4 py-5 flex items-center gap-3">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs text-white flex-shrink-0"
            style={{ background: "var(--accent)" }}
          >
            ZC
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white leading-none">Mission Control</p>
            <p className="text-[10px] text-white/40 mt-0.5 leading-none">Zebra Consulting</p>
          </div>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>

        <div className="h-px mx-4" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {NAV_SECTIONS.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-3" : ""}>
              {section.heading && (
                <p
                  className="px-3 pb-1 text-[10px] uppercase tracking-widest select-none"
                  style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em" }}
                >
                  {section.heading}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <NavLink
                      key={item.href}
                      item={item}
                      active={active}
                      onClose={onClose}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 space-y-3">
          <div className="h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
          <DeployBadge />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-white/50 truncate min-w-0 flex-1">
              {session?.user?.email ?? ""}
            </p>
            <button
              onClick={() => signOut({ callbackUrl: "/auth" })}
              className="flex-shrink-0 p-1.5 rounded-lg transition-colors"
              style={{ color: "rgba(255,255,255,0.4)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "var(--sidebar-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "transparent"; }}
              title="Sign out"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
