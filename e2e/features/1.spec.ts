import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test("PR #1 — navigates to /test and verifies pipeline card content", async ({ page }) => {
  await page.goto("/test", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Hello from the pipeline", { timeout: 10_000 });
  const card = page.locator("text=Pipeline is working");
  await expect(card).toBeVisible({ timeout: 5_000 });
  const description = page.locator("text=This page was shipped by the automated agent pipeline");
  await expect(description).toBeVisible({ timeout: 5_000 });
});

test("PR #1 — sidebar Home link navigates back to home", async ({ page }) => {
  await page.goto("/test", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Hello from the pipeline", { timeout: 10_000 });
  await page.click('a[href="/"]');
  // Home page heading is "Hello [first name]" once authenticated.
  await expect(page.locator("h1")).toContainText("Hello", { timeout: 10_000 });
});
