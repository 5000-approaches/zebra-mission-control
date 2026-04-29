import { test, expect } from "@playwright/test";

test("unauthenticated visit to / redirects to /auth", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/auth/, { timeout: 10_000 });
});

test("auth page shows Mission Control heading and Google sign-in button", async ({ page }) => {
  await page.goto("/auth", { waitUntil: "domcontentloaded" });
  await expect(page.locator("h1")).toContainText("Mission Control", { timeout: 10_000 });
  await expect(page.getByRole("button", { name: /sign in with google/i })).toBeVisible({ timeout: 10_000 });
});
