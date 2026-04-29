import { test, expect } from "@playwright/test";

test("home page loads with Mission Control heading", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Mission Control", { timeout: 10_000 });
});

test("sidebar renders with Home navigation link", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Sidebar is hidden on mobile, but the Home nav link should always be in DOM.
  const homeLink = page.locator('a[href="/"]', { hasText: "Home" });
  await expect(homeLink.first()).toBeAttached({ timeout: 10_000 });
});
