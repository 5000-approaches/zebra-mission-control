"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, FolderKanban, Activity, Settings, X } from "lucide-react";
import DeployBadge from "./DeployBadge";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

type NavSection = {
  heading: string | null;
  items: NavItem[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    heading: null,
    items: [{ href: "/", label: "Home", icon: Home }],
  },
  {
    heading: "Workspace",
    items: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/heartbeat", label: "Heartbeat", icon: Activity },
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
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: active ? "var(--sidebar-active-bg)" : "transparent",
        color: active ? "#ffffff" : "rgba(255,255,255,0.65)",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--sidebar-hover)";
          e.currentTarget.style.color = "#ffffff";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.65)";
        }
      }}
    >
      <Icon size={16} className="flex-shrink-0" />
      {label}
    </Link>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();

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
        </div>
      </aside>
    </>
  );
}
