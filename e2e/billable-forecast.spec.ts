import { test, expect } from "@playwright/test";

test("sidebar shows Billable Forecast link under Workspace", async ({ page }) => {
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href="/billable-forecast"]', { hasText: "Billable Forecast" });
  await expect(link.first()).toBeAttached({ timeout: 10_000 });
});
