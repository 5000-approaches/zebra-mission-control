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
  await expect(assistantMsg.locator("th").first()).toContainText("Field");
  await expect(assistantMsg.locator("strong").first()).toContainText("Period");
  await expect(assistantMsg.locator("blockquote")).toContainText("on track");
});

test("tool errors render as a collapsible details block", async ({ page }) => {
  const errorPayload = [
    {
      tool: "getForecast",
      input: { month: "2050-01" },
      error: "MCP error: unable to reach upstream PowerOffice service (HTTP 503)",
    },
  ];
  await page.route("/api/forecast-chat", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/plain; charset=utf-8",
      body:
        "Sorry, the forecast tool failed.\n\n<<<TOOL_ERRORS>>>" +
        JSON.stringify(errorPayload) +
        "<<<END_TOOL_ERRORS>>>",
    });
  });

  await page.goto("/forecast", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  await page.fill('input[type="text"]', "Forecast for 2050?");
  await page.click('button[type="submit"]');

  const assistantMsg = page.locator('[data-testid="assistant-message"]').first();
  await expect(assistantMsg).toContainText("the forecast tool failed", { timeout: 10_000 });
  // The raw marker must not leak into the rendered text.
  await expect(assistantMsg).not.toContainText("TOOL_ERRORS");

  const details = assistantMsg.locator('[data-testid="tool-errors"]');
  await expect(details).toBeAttached();

  // Collapsed by default — the error body is not rendered visibly until clicked.
  await expect(details.locator("summary")).toContainText("Show technical error details");

  await details.locator("summary").click();
  await expect(details).toContainText("MCP error: unable to reach upstream");
  await expect(details).toContainText("getForecast");
});
