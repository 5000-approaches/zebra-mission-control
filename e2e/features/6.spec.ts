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

  test("PowerOffice API GET returns url and key fields", async ({ page }) => {
    const response = await page.goto("/api/settings/integrations/poweroffice", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    const body = await response?.json();
    expect(body).toHaveProperty("url");
    expect(body).toHaveProperty("key");
  });

  test("PowerOffice API PATCH rejects invalid JSON with 400", async ({ request }) => {
    const response = await request.patch("/api/settings/integrations/poweroffice", {
      data: "not json",
      headers: { "Content-Type": "text/plain" },
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Invalid JSON");
  });
});
