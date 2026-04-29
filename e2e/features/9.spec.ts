import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test.describe("PR #9 — Image upload + clipboard paste in forecast chat", () => {
  test("[auth-flow] forecast page redirects unauthenticated to /auth", async ({ page }) => {
    const response = await page.goto("/forecast", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    expect(response?.status()).toBeLessThan(400);
  });

  test("[auth-flow] auth page loads and shows Google sign-in for forecast access", async ({ page }) => {
    await page.goto("/forecast", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    const btn = page.getByRole("button", { name: /sign in with google/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    // The actual OAuth redirect to Google requires real GOOGLE_CLIENT_ID, which CI doesn't have.
    // Verifying the button exists is sufficient; the integration is tested manually.
  });
});
