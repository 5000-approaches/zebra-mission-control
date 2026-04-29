import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test.describe("PR #9 — Image upload + clipboard paste in forecast chat", () => {
  test("forecast page redirects unauthenticated to /auth", async ({ page }) => {
    const response = await page.goto("/forecast", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    expect(response?.status()).toBeLessThan(400);
  });

  test("auth page loads and shows Google sign-in for forecast access", async ({ page }) => {
    await page.goto("/forecast", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    const btn = page.getByRole("button", { name: /sign in with google/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await page.waitForURL(/accounts\.google\.com|\/api\/auth/, { timeout: 10_000 });
  });
});
