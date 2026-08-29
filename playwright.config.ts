import { defineConfig, devices } from "@playwright/test";

/**
 * Real, checked-in E2E coverage for the small-crew project workflow.
 * Assumes the dev server's database has been freshly seeded
 * (`npm run db:migrate -- reset` or `npx prisma migrate reset --force`,
 * which runs `npm run db:seed`) before the suite runs — tests read known
 * seeded accounts/jobs (see tests/e2e/helpers.ts) rather than re-seeding
 * per test, so results depend on that seed state.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // In the sandboxed dev environment, PLAYWRIGHT_CHROMIUM_PATH points
        // at the pre-installed browser instead of downloading one; unset
        // elsewhere, this falls back to Playwright's normal managed browser.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : undefined,
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
