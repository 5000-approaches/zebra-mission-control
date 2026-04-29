"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname === "/auth";
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isAuth) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Mobile top header */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 h-14 flex items-center gap-3 px-4 z-40"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Open menu"
        >
          <Menu size={22} />
        </button>
        <p className="text-sm font-semibold text-white">Mission Control</p>
      </header>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <main className="flex-1 md:ml-[240px] pt-14 md:pt-0">
        {children}
      </main>
    </div>
  );
}
