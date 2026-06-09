import { describe, it, expect, vi } from "vitest";
import { NAV_SECTIONS, NavLink } from "@/components/Sidebar";

vi.mock("next/link", () => ({
  default: ({ children, href, onClick, style, className, onMouseEnter, onMouseLeave }: {
    children?: unknown;
    href?: string;
    onClick?: unknown;
    style?: unknown;
    className?: string;
    onMouseEnter?: unknown;
    onMouseLeave?: unknown;
  }) => ({ type: "a", props: { href, onClick, style, className, onMouseEnter, onMouseLeave, children } }),
}));

vi.mock("lucide-react", () => ({
  Home: () => null,
  Settings: () => null,
  X: () => null,
  LogOut: () => null,
  MessageSquare: () => null,
  BarChart2: () => null,
  LineChart: () => null,
  Folder: () => null,
}));

function flatten(node: unknown, depth = 0): string {
  if (depth > 20 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => flatten(n, depth)).join(" ");
  if (typeof node === "object" && node !== null) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      try {
        return flatten(
          (el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}),
          depth + 1
        );
      } catch {
        return "";
      }
    }
    if (el.props) return flatten(el.props.children, depth + 1);
  }
  return "";
}

describe("NAV_SECTIONS structure", () => {
  it("has four sections", () => {
    expect(NAV_SECTIONS).toHaveLength(4);
  });

  it("first section has no heading and contains Home", () => {
    expect(NAV_SECTIONS[0].heading).toBeNull();
    expect(NAV_SECTIONS[0].items.some((i) => i.href === "/")).toBe(true);
  });

  it("Workspace section contains Forecast Agent and Forecast", () => {
    const ws = NAV_SECTIONS.find((s) => s.heading === "Workspace");
    expect(ws).toBeDefined();
    const hrefs = ws!.items.map((i) => i.href);
    expect(hrefs).toContain("/agent");
    expect(hrefs).toContain("/forecast");
  });

  it("Admin section contains Settings", () => {
    const admin = NAV_SECTIONS.find((s) => s.heading === "Admin");
    expect(admin).toBeDefined();
    expect(admin!.items.some((i) => i.href === "/settings")).toBe(true);
  });

  it("every nav item has href, label, and icon", () => {
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        expect(item.href).toBeTruthy();
        expect(item.label).toBeTruthy();
        expect(item.icon).toBeTruthy();
      }
    }
  });

  it("billable-forecast item is disabled with Soon badge", () => {
    const ws = NAV_SECTIONS.find((s) => s.heading === "Workspace");
    const item = ws!.items.find((i) => i.href === "/billable-forecast");
    expect(item).toBeDefined();
    expect(item!.disabled).toBe(true);
    expect(item!.badge).toBe("Soon");
  });
});

describe("NavLink rendering", () => {
  const IconStub = () => null;
  const noop = () => {};

  it("renders the label text", () => {
    const el = NavLink({
      item: { href: "/test", label: "Test Page", icon: IconStub },
      active: false,
      onClose: noop,
    });
    const text = flatten(el);
    expect(text).toContain("Test Page");
  });

  it("renders badge text when badge is set", () => {
    const el = NavLink({
      item: { href: "/billable-forecast", label: "Billable Forecast", icon: IconStub, disabled: true, badge: "Soon" },
      active: false,
      onClose: noop,
    });
    const text = flatten(el);
    expect(text).toContain("Soon");
    expect(text).toContain("Billable Forecast");
  });

  it("does not render badge span when badge is absent", () => {
    const el = NavLink({
      item: { href: "/agent", label: "Forecast Agent", icon: IconStub },
      active: false,
      onClose: noop,
    });
    const text = flatten(el);
    expect(text).not.toContain("Soon");
    expect(text).toContain("Forecast Agent");
  });

  it("applies disabled styles when disabled is true", () => {
    const el = NavLink({
      item: { href: "/billable-forecast", label: "Billable Forecast", icon: IconStub, disabled: true, badge: "Soon" },
      active: false,
      onClose: noop,
    }) as { props?: { style?: { opacity?: number; cursor?: string; pointerEvents?: string } } };
    expect(el.props?.style?.opacity).toBe(0.5);
    expect(el.props?.style?.cursor).toBe("default");
    expect(el.props?.style?.pointerEvents).toBe("none");
  });

  it("applies active styles when active is true", () => {
    const el = NavLink({
      item: { href: "/", label: "Home", icon: IconStub },
      active: true,
      onClose: noop,
    }) as { props?: { style?: { color?: string } } };
    expect(el.props?.style?.color).toBe("#ffffff");
  });
});
