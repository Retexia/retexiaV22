import { defineConfig, devices } from "@playwright/test";
import { ADMIN_URL, WEB_URL, appEnv } from "./env";

/**
 * End-to-end tests for retexia.com and admin.retexia.com against a local
 * Supabase stand-in (scripts/e2e/mock-supabase.mjs). Nothing touches a real
 * Supabase project.
 *
 *   pnpm e2e
 */
export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { trace: "retain-on-failure", actionTimeout: 15_000, navigationTimeout: 60_000 },
  // channel "chromium" = full Chromium in headless mode (no separate headless shell download).
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chromium" } }],
  globalSetup: "./global-setup.ts",
  webServer: [
    {
      command: "node scripts/e2e/mock-supabase.mjs",
      cwd: "..",
      url: "http://localhost:54321/auth/v1/settings",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @retexia/web exec next dev -p 3100",
      cwd: "..",
      url: WEB_URL,
      env: appEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: "pnpm --filter @retexia/admin exec next dev -p 3101",
      cwd: "..",
      url: `${ADMIN_URL}/login`,
      env: appEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
