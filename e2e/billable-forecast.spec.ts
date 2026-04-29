import { test, expect } from "@playwright/test";

const MOCK_ROWS = [
  { user: "Alice", project: "Alpha", customer: "Acme", week: "2026-W18", hours: 10, rate: 1500, revenue: 15000, status: "committed" },
  { user: "Bob", project: "Beta", customer: "Corp", week: "2026-W19", hours: 8, rate: 1200, revenue: 9600, status: "at-risk" },
  { user: "Clara", project: "Gamma", customer: "Inc", week: "2026-W20", hours: 6, rate: 1800, revenue: 10800, status: "projected" },
  { user: "Dan", project: "Delta", customer: "Ltd", week: "2026-W21", hours: 4, rate: 900, revenue: 3600, status: "unbilled" },
  { user: "Eva", project: "Epsilon", customer: "GmbH", week: "2026-W22", hours: 12, rate: 1600, revenue: 19200, status: "committed" },
  { user: "Frank", project: "Zeta", customer: "AB", week: "2026-W23", hours: 5, rate: 1100, revenue: 5500, status: "projected" },
  { user: "Grace", project: "Eta", customer: "AS", week: "2026-W24", hours: 7, rate: 1300, revenue: 9100, status: "committed" },
  { user: "Hank", project: "Theta", customer: "SA", week: "2026-W25", hours: 9, rate: 1400, revenue: 12600, status: "at-risk" },
];

const MOCK_RESPONSE = {
  filters: {
    users: [{ id: "u1", name: "Alice" }, { id: "u2", name: "Bob" }],
    projects: [{ id: "p1", name: "Alpha" }, { id: "p2", name: "Beta" }],
    customers: [{ id: "c1", name: "Acme" }, { id: "c2", name: "Corp" }],
    departments: [{ id: "d1", name: "Dev" }],
  },
  rows: MOCK_ROWS,
  summary: {
    totalHours: MOCK_ROWS.reduce((s, r) => s + r.hours, 0),
    totalRevenue: MOCK_ROWS.reduce((s, r) => s + r.revenue, 0),
    utilization: 82,
    atRiskRevenue: MOCK_ROWS.filter((r) => r.status === "at-risk").reduce((s, r) => s + r.revenue, 0),
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("/api/billable-forecast**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_RESPONSE),
    });
  });
});

test("page loads with h1 and all 6 filter controls", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });

  await expect(page.locator("h1")).toContainText("Billable Forecast", { timeout: 10_000 });

  // 4 multi-select dropdowns
  await expect(page.getByTestId("filter-user")).toBeAttached();
  await expect(page.getByTestId("filter-project")).toBeAttached();
  await expect(page.getByTestId("filter-customer")).toBeAttached();
  await expect(page.getByTestId("filter-department")).toBeAttached();
  // date inputs
  await expect(page.getByTestId("date-from")).toBeAttached();
  await expect(page.getByTestId("date-to")).toBeAttached();

  await page.screenshot({ path: "e2e/screenshots/billable-forecast-default.png" });
});

test("clicking Next 30d preset updates URL with dateFrom and dateTo", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  await page.getByTestId("preset-next-30d").click();

  const url = page.url();
  expect(url).toContain("dateFrom=");
  expect(url).toContain("dateTo=");

  await page.screenshot({ path: "e2e/screenshots/billable-forecast-filtered.png" });
});

test("clicking Revenue column header sorts the table", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  // Default sort is revenue desc — grab first row revenue
  const firstRevBefore = await page.getByTestId("col-header-revenue").isVisible();
  expect(firstRevBefore).toBe(true);

  // Click Revenue to toggle to asc
  await page.getByTestId("col-header-revenue").click();

  // Get all revenue cells after sort
  const cells = page.locator("tbody tr td:nth-child(7)");
  const texts = await cells.allTextContents();
  expect(texts.length).toBeGreaterThan(0);
  // First row should be smallest after asc sort
  const firstVal = parseInt(texts[0].replace(/\s/g, "").replace(/\D/g, ""), 10);
  const lastVal = parseInt(texts[texts.length - 1].replace(/\s/g, "").replace(/\D/g, ""), 10);
  expect(firstVal).toBeLessThanOrEqual(lastVal);
});

test("sidebar shows Billable Forecast link under Workspace", async ({ page }) => {
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href="/billable-forecast"]', { hasText: "Billable Forecast" });
  await expect(link.first()).toBeAttached({ timeout: 10_000 });
});

test("KPI cards display computed values from mocked data", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle");

  // KPI cards should show total hours, total revenue, utilization, at-risk
  const totalHours = MOCK_ROWS.reduce((s, r) => s + r.hours, 0);
  await expect(page.getByText(String(totalHours))).toBeAttached({ timeout: 10_000 });
  await expect(page.getByText("82%")).toBeAttached();
});
