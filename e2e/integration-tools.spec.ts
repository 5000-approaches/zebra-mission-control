import { test, expect } from "@playwright/test";

const MOCK_TOOLS = {
  integrations: [
    {
      id: "poweroffice",
      label: "PowerOffice",
      howToCombine: "Find a project first, then ask for its forecast.",
      tools: [
        { name: "forecast", description: "Build a billable forecast", friendlyName: "Revenue forecast", purpose: "Estimates what a period will bill." },
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

test("agent home page lists each MCP server with its tools in plain language", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const list = page.getByTestId("integration-tools-list");
  const server = list.getByTestId("integration-server").first();
  await expect(server).toContainText("PowerOffice", { timeout: 10_000 });
  await expect(server).toContainText("2 tools");

  await server.locator("summary").click();

  const items = page.getByTestId("integration-tool");
  await expect(items).toHaveCount(2);
  await expect(items.first()).toContainText("Revenue forecast");
  await expect(items.first()).toContainText("Estimates what a period will bill.");
  await expect(items.first()).toContainText("forecast");
  await expect(items.nth(1)).toContainText("list_invoices");
  await expect(server).toContainText("Find a project first");

  await page.screenshot({ path: "e2e/screenshots/agent-tools-expanded.png" });
});

test("settings page shows the PowerOffice tools inside its card when expanded", async ({ page }) => {
  await page.route("**/api/mcp-servers", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ servers: [{ id: "poweroffice", name: "PowerOffice", url: "https://example.test/mcp", headerName: "x-functions-key", builtIn: true, keyMasked: "••••ab12" }] }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  await page.getByText("PowerOffice MCP", { exact: true }).first().click();
  await expect(page.getByText("Available tools")).toBeVisible({ timeout: 10_000 });

  const card = page.getByTestId("integration-server").first();
  await expect(card).toContainText("PowerOffice");
  await card.locator("summary").click();
  const items = card.getByTestId("integration-tool");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("list_invoices");

  await expect(page.getByTestId("mcp-servers-card")).toContainText("MCP servers");
  await expect(page.getByTestId("mcp-server-row")).toHaveCount(1);

  await page.screenshot({ path: "e2e/screenshots/settings-tools-embedded.png" });
});
