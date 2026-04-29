import { test, expect } from "@playwright/test";

test("forecast chat page loads with chat input", async ({ page }) => {
  await page.goto("/agent", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Forecast Chat", { timeout: 10_000 });
  await expect(page.locator('input[type="text"]')).toBeAttached({ timeout: 5_000 });
  await expect(page.locator('button[type="submit"]')).toBeAttached({ timeout: 5_000 });
});

test("sidebar shows Forecast Chat link under Workspace", async ({ page }) => {
  await page.goto("/agent", { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href="/agent"]', { hasText: "Forecast Chat" });
  await expect(link.first()).toBeAttached({ timeout: 10_000 });
});

test("forecast page is an empty placeholder", async ({ page }) => {
  await page.goto("/forecast", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Forecast", { timeout: 10_000 });
});

test("submitting a question streams AI response into chat", async ({ page }) => {
  await page.route("/api/forecast-chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "Forecast summary:\n\nPeriod: April 2026\nObserved: 300,000 NOK\nProjected total: 500,000 NOK\nCalculated at: 2026-04-29",
    });
  });

  await page.goto("/agent", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  await page.fill('input[type="text"]', "What is our billable forecast for April?");
  await page.click('button[type="submit"]');

  const assistantMsg = page.locator('[data-testid="assistant-message"]');
  await expect(assistantMsg.first()).toContainText("Projected total", { timeout: 10_000 });
});
