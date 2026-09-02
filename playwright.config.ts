import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 4 : undefined,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    headless: true,
    extraHTTPHeaders: {
      "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // CI manages prebuilt `next start` servers itself (see .github/workflows/ci.yml).
  // Local: uses prebuilt server too — requires `npm run build` first (Coder step 2).
  webServer: (process.env.CI || process.env.PLAYWRIGHT_BASE_URL) ? undefined : {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 60_000,
    stdout: "ignore",
    stderr: "ignore",
  },
});
