import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test.describe("PR #6 — Mission Control cleanup", () => {
  test("[auth-flow] unauthenticated / redirects to /auth with sign-in button", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    expect(response?.status()).toBeLessThan(400);
    const btn = page.getByRole("button", { name: /sign in with google/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
  });

  test("[auth-flow] /forecast page exists and redirects to auth when unauthenticated", async ({ page }) => {
    await page.goto("/forecast", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  });

});
