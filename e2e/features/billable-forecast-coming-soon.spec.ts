import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test("billable-forecast — shows Coming soon text", async ({ page }) => {
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Coming soon")).toBeVisible({ timeout: 10_000 });
});

test("billable-forecast — sidebar shows Soon badge on the entry", async ({ page }) => {
  await page.goto("/billable-forecast", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Soon", { exact: true })).toBeVisible({ timeout: 10_000 });
});
