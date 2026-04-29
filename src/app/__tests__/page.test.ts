import { describe, it, expect } from "vitest";

describe("Home page firstName extraction", () => {
  function extractFirstName(name: string | null | undefined): string {
    return name?.split(" ")[0] ?? "";
  }

  it("returns first name from full name", () => {
    expect(extractFirstName("Rune Larsen")).toBe("Rune");
  });

  it("returns the only word when name has no space", () => {
    expect(extractFirstName("Rune")).toBe("Rune");
  });

  it("returns empty string when name is undefined", () => {
    expect(extractFirstName(undefined)).toBe("");
  });

  it("returns empty string when name is null", () => {
    expect(extractFirstName(null)).toBe("");
  });

  it("returns empty string when name is empty", () => {
    expect(extractFirstName("")).toBe("");
  });
});

describe("NAV_BOXES structure", () => {
  it("has Forecast Agent and Forecast entries", async () => {
    const { NAV_BOXES } = await import("@/app/page");
    const hrefs = NAV_BOXES.map((b) => b.href);
    expect(hrefs).toContain("/agent");
    expect(hrefs).toContain("/forecast");
  });

  it("every box has href, label, icon, and description", async () => {
    const { NAV_BOXES } = await import("@/app/page");
    for (const box of NAV_BOXES) {
      expect(box.href).toBeTruthy();
      expect(box.label).toBeTruthy();
      expect(box.icon).toBeTruthy();
      expect(box.description).toBeTruthy();
    }
  });
});
