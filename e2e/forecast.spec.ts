import { test, expect } from "@playwright/test";

test("forecast page loads with chat input", async ({ page }) => {
  await page.goto("/forecast", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Forecast Chat", { timeout: 10_000 });
  await expect(page.locator('input[type="text"]')).toBeAttached({ timeout: 5_000 });
  await expect(page.locator('button[type="submit"]')).toBeAttached({ timeout: 5_000 });
});

test("sidebar shows Forecast link under Workspace", async ({ page }) => {
  await page.goto("/forecast", { waitUntil: "domcontentloaded" });
  const forecastLink = page.locator('a[href="/forecast"]', { hasText: "Forecast" });
  await expect(forecastLink.first()).toBeAttached({ timeout: 10_000 });
});

test("submitting a question streams AI response into chat", async ({ page }) => {
  // Intercept the API route and return a mocked streamed response
  await page.route("/api/forecast-chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: "Forecast summary:\n\nPeriod: April 2026\nObserved: 300,000 NOK\nProjected total: 500,000 NOK\nCalculated at: 2026-04-29",
    });
  });

  await page.goto("/forecast", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  await page.fill('input[type="text"]', "What is our billable forecast for April?");
  await page.click('button[type="submit"]');

  const assistantMsg = page.locator('[data-testid="assistant-message"]');
  await expect(assistantMsg.first()).toContainText("Projected total", { timeout: 10_000 });
});

test("assistant response renders markdown as HTML (headings, tables, bold)", async ({ page }) => {
  await page.route("/api/forecast-chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body: [
        "## July 2025 — Monthly Billing Forecast",
        "",
        "| Field | Value |",
        "|---|---|",
        "| **Period** | July 1–31, 2025 |",
        "| **Projected July total** | **NOK 472,302** |",
        "",
        "> You're roughly on track.",
      ].join("\n"),
    });
  });

  await page.goto("/forecast", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  await page.fill('input[type="text"]', "What's the July forecast?");
  await page.click('button[type="submit"]');

  const assistantMsg = page.locator('[data-testid="assistant-message"]').first();
  await expect(assistantMsg.locator("h2")).toContainText("July 2025", { timeout: 10_000 });
  await expect(assistantMsg.locator("table")).toBeAttached();
  await expect(assistantMsg.locator("th")).toContainText("Field");
  await expect(assistantMsg.locator("strong").first()).toContainText("Period");
  await expect(assistantMsg.locator("blockquote")).toContainText("on track");
});
