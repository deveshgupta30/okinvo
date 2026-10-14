import { defineConfig, devices } from "@playwright/test";

// CI runs the production server on E2E_PORT (3100 there) so it never collides with a dev server or
// another container on 3000; locally the default stays 3000 and `pnpm dev` is reused.
const port = process.env.E2E_PORT ?? "3000";
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // One dev server and one small Postgres pool behind every spec: more than a few parallel
  // sessions makes cold-route compiles and connection waits time out rather than run faster.
  workers: process.env.CI ? 2 : 3,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Dev compiles each route on first hit, so post-navigation assertions need headroom.
  expect: { timeout: 30_000 },
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /templates\.spec\.ts$/,
    },
    // The templates spec saves the instance template, which every live preview reads, so it
    // runs on its own after the parallel specs instead of racing their page estimates.
    {
      name: "chromium-templates",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /templates\.spec\.ts$/,
      dependencies: ["chromium"],
    },
    // Phone layout: the specs that assert the shell, the smoke checks and the mobile pass.
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /(smoke|shell|mobile|onboarding)\.spec\.ts$/,
    },
  ],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: `${origin}/api/health/live`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // The specs sign up (first run) or sign in (later runs) two fixed owners through the password
    // form (plan R1); password sign-up needs exact allow-list entries, not a *@domain pattern.
    env: {
      PORT: port,
      APP_URL: origin,
      AUTH_PASSWORD_SIGNIN: "true",
      AUTH_ALLOWED_EMAILS:
        "e2e@example.com,smoke@example.com,e2e-onboard@example.com,e2e-i18n@example.com",
    },
  },
});
