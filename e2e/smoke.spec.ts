import { test, expect } from "@playwright/test";

test("unauthenticated home redirects to auth page", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
  await expect(page.locator("h1")).toContainText("Mission Control", { timeout: 10_000 });
});

test("auth page renders Google sign-in button", async ({ page }) => {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  const btn = page.getByRole("button", { name: /sign in with google/i });
  await expect(btn).toBeVisible({ timeout: 10_000 });
});
