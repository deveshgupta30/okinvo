import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Dev compiles each route on first hit, so post-navigation assertions need headroom.
  expect: { timeout: 30_000 },
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CI ? "pnpm build && pnpm start" : "pnpm dev",
    url: "http://127.0.0.1:3000/api/health/live",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // The specs sign up (first run) or sign in (later runs) two fixed owners through the password
    // form (plan R1); password sign-up needs exact allow-list entries, not a *@domain pattern.
    env: {
      APP_URL: "http://127.0.0.1:3000",
      AUTH_PASSWORD_SIGNIN: "true",
      AUTH_ALLOWED_EMAILS: "e2e@example.com,smoke@example.com",
    },
  },
});
