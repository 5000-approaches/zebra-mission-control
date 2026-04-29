import { test, expect } from "@playwright/test";

test("test page loads with pipeline heading", async ({ page }) => {
  await page.goto("/test", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Hello from the pipeline", { timeout: 10_000 });
});
