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

const MOCK_SERVERS = {
  servers: [
    { id: "poweroffice", name: "PowerOffice", url: "https://example.test/mcp", headerName: "x-functions-key", keyMasked: "••••ab12" },
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

test("settings page lists PowerOffice as an editable MCP server and shows its tools", async ({ page }) => {
  await page.route("**/api/mcp-servers", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SERVERS) });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/settings", { waitUntil: "load" });
  await page.waitForLoadState("networkidle");

  // No separate PowerOffice card any more: it is a regular row with edit and remove controls.
  await expect(page.getByText("PowerOffice MCP", { exact: true })).toHaveCount(0);
  const card = page.getByTestId("mcp-servers-card");
  await expect(card).toContainText("MCP servers");
  const row = page.getByTestId("mcp-server-row");
  await expect(row).toHaveCount(1);
  await expect(row.first()).toContainText("PowerOffice");
  await expect(row.first()).not.toContainText("built-in");
  await expect(row.first().getByRole("button", { name: "Edit" })).toBeVisible();
  await expect(row.first().getByRole("button", { name: "Remove" })).toBeVisible();
  await expect(row.first().getByRole("button", { name: "Refresh tools" })).toBeVisible();

  await row.first().getByRole("button", { name: "Edit" }).click();
  const form = page.getByTestId("mcp-server-form");
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Friendly name")).toHaveValue("PowerOffice");
  await expect(form.getByLabel("MCP URL")).toHaveValue("https://example.test/mcp");

  const catalog = page.getByTestId("integration-server").first();
  await expect(catalog).toContainText("PowerOffice");
  await catalog.locator("summary").click();
  const items = catalog.getByTestId("integration-tool");
  await expect(items).toHaveCount(2);
  await expect(items.nth(1)).toContainText("list_invoices");

  await page.screenshot({ path: "e2e/screenshots/settings-tools-embedded.png" });
});
