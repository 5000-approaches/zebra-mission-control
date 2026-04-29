import { test, expect } from "@playwright/test";

test.use({ video: "on", trace: "on" });

test.describe("PR #2 — Google SSO", () => {
  test("unauthenticated / redirects to /auth", async ({ page }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
    expect(response?.status()).toBeLessThan(400);
  });

  test("auth page shows Mission Control branding and Google button", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("Mission Control", { timeout: 10_000 });
    const btn = page.getByRole("button", { name: /sign in with google/i });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
    await page.waitForURL(/accounts\.google\.com|\/api\/auth/, { timeout: 10_000 });
  });

  test("auth page has no sidebar chrome", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expect(page.locator("h1")).toContainText("Mission Control", { timeout: 10_000 });
    const sidebar = page.locator("aside");
    await expect(sidebar).toHaveCount(0);
  });

  test("auth page has ZC logo badge", async ({ page }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    const logo = page.locator("div").filter({ hasText: /^ZC$/ }).first();
    await expect(logo).toBeVisible({ timeout: 10_000 });
  });
});
