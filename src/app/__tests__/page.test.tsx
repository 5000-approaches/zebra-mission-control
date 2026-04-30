import { describe, it, expect, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: { href: string; children: React.ReactNode }) => ({
    type: "a",
    props: { href: props.href, children: props.children },
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: vi.fn(),
}));

vi.mock("@/components/AttentionPanel", () => ({
  default: () => ({ type: "div", props: { "data-testid": "attention-panel-mock" } }),
}));

import { useSession } from "next-auth/react";
import Home, { NAV_BOXES } from "@/app/page";

const mockedUseSession = vi.mocked(useSession);

function flatten(node: unknown, depth = 0): string {
  if (depth > 30 || node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((n) => flatten(n, depth)).join(" ");
  if (typeof node === "object" && node !== null) {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (typeof el.type === "function") {
      try {
        return flatten((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), depth + 1);
      } catch {
        return "";
      }
    }
    const children = (el.props as { children?: unknown } | undefined)?.children;
    return flatten(children, depth);
  }
  return "";
}

function collectHrefs(node: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 30 || node == null) return out;
  if (Array.isArray(node)) {
    for (const n of node) collectHrefs(n, depth, out);
    return out;
  }
  if (typeof node === "object") {
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.props?.href) out.push(String(el.props.href));
    if (typeof el.type === "function") {
      try {
        collectHrefs((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), depth + 1, out);
      } catch {
        /* ignore */
      }
    } else {
      collectHrefs((el.props as { children?: unknown } | undefined)?.children, depth, out);
    }
  }
  return out;
}

type SessionShape = ReturnType<typeof useSession>;

function makeSession(name: string | undefined): SessionShape {
  if (name === undefined) {
    return { data: null, status: "unauthenticated", update: vi.fn() } as unknown as SessionShape;
  }
  return {
    data: { user: { name }, expires: "2099-01-01" },
    status: "authenticated",
    update: vi.fn(),
  } as unknown as SessionShape;
}

describe("Home page firstName extraction", () => {
  it("greets with first name from full name", () => {
    mockedUseSession.mockReturnValue(makeSession("Rune Larsen"));
    const text = flatten((Home as () => unknown)());
    expect(text).toContain("Hello");
    expect(text).toContain("Rune");
    expect(text).not.toContain("Larsen");
  });

  it("uses single-word name as the first name", () => {
    mockedUseSession.mockReturnValue(makeSession("Rune"));
    const text = flatten((Home as () => unknown)());
    expect(text).toContain("Rune");
  });

  it("renders bare 'Hello' when no session", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const text = flatten((Home as () => unknown)());
    expect(text).toContain("Hello");
  });

  it("renders bare 'Hello' when session has no name", () => {
    mockedUseSession.mockReturnValue({
      data: { user: {}, expires: "2099-01-01" },
      status: "authenticated",
      update: vi.fn(),
    } as unknown as SessionShape);
    const text = flatten((Home as () => unknown)());
    expect(text).toContain("Hello");
  });
});

describe("Home page navigation", () => {
  it("renders a link for every NAV_BOXES entry", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const hrefs = collectHrefs((Home as () => unknown)());
    for (const box of NAV_BOXES) {
      expect(hrefs).toContain(box.href);
    }
  });

  it("renders each NAV_BOXES label and description in the rendered tree", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const text = flatten((Home as () => unknown)());
    for (const box of NAV_BOXES) {
      expect(text).toContain(box.label);
      expect(text).toContain(box.description);
    }
  });

  it("renders the disabled 'Billable forecast' tile with 'Coming soon'", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const text = flatten((Home as () => unknown)());
    expect(text).toContain("Billable forecast");
    expect(text).toContain("Coming soon");
  });

  it("does not render an <a> link for disabled tiles", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const uniqueHrefs = new Set(collectHrefs((Home as () => unknown)()));
    expect(uniqueHrefs.size).toBe(NAV_BOXES.length);
    expect(uniqueHrefs.has("/billable-forecast")).toBe(false);
  });
});

describe("NAV_BOXES link hover handlers", () => {
  function findLinkProps(node: unknown, depth = 0): Record<string, unknown>[] {
    const out: Record<string, unknown>[] = [];
    function walk(n: unknown, d: number) {
      if (d > 30 || n == null) return;
      if (Array.isArray(n)) {
        for (const c of n) walk(c, d);
        return;
      }
      if (typeof n === "object") {
        const el = n as { type?: unknown; props?: Record<string, unknown> };
        if (typeof el.type === "function" && el.props?.href && el.props?.onMouseEnter) {
          out.push(el.props);
        }
        if (typeof el.type === "function") {
          try {
            walk((el.type as (p: Record<string, unknown>) => unknown)(el.props ?? {}), d + 1);
          } catch {
            /* ignore */
          }
        } else {
          walk((el.props as { children?: unknown } | undefined)?.children, d);
        }
      }
    }
    walk(node, depth);
    return out;
  }

  it("invokes onMouseEnter and onMouseLeave style handlers without throwing", () => {
    mockedUseSession.mockReturnValue(makeSession(undefined));
    const linkProps = findLinkProps((Home as () => unknown)());
    expect(linkProps.length).toBeGreaterThan(0);
    for (const props of linkProps) {
      const onEnter = props.onMouseEnter as (e: { currentTarget: { style: Record<string, string> } }) => void;
      const onLeave = props.onMouseLeave as (e: { currentTarget: { style: Record<string, string> } }) => void;
      const fakeEvent = { currentTarget: { style: { borderColor: "" } } };
      onEnter(fakeEvent);
      expect(fakeEvent.currentTarget.style.borderColor).toBe("var(--accent)");
      onLeave(fakeEvent);
      expect(fakeEvent.currentTarget.style.borderColor).toBe("var(--page-border)");
    }
  });
});

describe("NAV_BOXES structure", () => {
  it("has Forecast Agent and Forecast entries", () => {
    const hrefs = NAV_BOXES.map((b) => b.href);
    expect(hrefs).toContain("/agent");
    expect(hrefs).toContain("/forecast");
  });

  it("every box has href, label, icon, and description", () => {
    for (const box of NAV_BOXES) {
      expect(box.href).toBeTruthy();
      expect(box.label).toBeTruthy();
      expect(box.icon).toBeTruthy();
      expect(box.description).toBeTruthy();
    }
  });
});
