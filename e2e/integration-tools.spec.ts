import { test, expect } from "@playwright/test";

const MOCK_TOOLS = {
  integrations: [
    {
      id: "poweroffice",
      label: "PowerOffice",
      tools: [
        { name: "forecast", description: "Build a billable forecast" },
        { name: "list_invoices", description: "List invoices for a period" },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/integrations/tools", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_TOOLS),
    });
  });
});

test("forecast chat page shows available tools count and lists tools when expanded", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/agent", { waitUntil: "domcontentloaded" });

  const pill = page.getByTestId("integration-tools-list").getByRole("button");
  await expect(pill).toContainText("Available tools (2)", { timeout: 10_000 });

  await pill.click();

  const items = page.getByTestId("integration-tool");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("forecast");
  await expect(items.first()).toContainText("Build a billable forecast");

  await page.screenshot({ path: "e2e/screenshots/agent-tools-expanded.png" });
});

test("settings page shows tools list inside PowerOffice card when expanded", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  // The card uses a single root <button> wrapping the title + chevron.
  // Use getByText then locate the closest <button> to be robust to button labels.
  await page.getByText("PowerOffice MCP", { exact: true }).first().click();

  await expect(page.getByText("Available tools")).toBeVisible({ timeout: 10_000 });

  const items = page.getByTestId("integration-tool");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("list_invoices");
  await expect(items.nth(1)).toContainText("List invoices for a period");

  await page.screenshot({ path: "e2e/screenshots/settings-tools-embedded.png" });
});
