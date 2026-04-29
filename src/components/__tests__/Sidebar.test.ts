import { describe, it, expect } from "vitest";
import { NAV_SECTIONS } from "@/components/Sidebar";

describe("NAV_SECTIONS structure", () => {
  it("has three sections", () => {
    expect(NAV_SECTIONS).toHaveLength(3);
  });

  it("first section has no heading and contains Home", () => {
    expect(NAV_SECTIONS[0].heading).toBeNull();
    expect(NAV_SECTIONS[0].items.some((i) => i.href === "/")).toBe(true);
  });

  it("Workspace section contains Forecast Chat and Forecast", () => {
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
});
