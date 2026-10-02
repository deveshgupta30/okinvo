import { defineConfig, devices } from "@playwright/test";

// CI runs the production server on E2E_PORT (3100 there) so it never collides with a dev server or
// another container on 3000; locally the default stays 3000 and `pnpm dev` is reused.
const port = process.env.E2E_PORT ?? "3000";
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  // Dev compiles each route on first hit, so post-navigation assertions need headroom.
  expect: { timeout: 30_000 },
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
      AUTH_ALLOWED_EMAILS: "e2e@example.com,smoke@example.com",
    },
  },
});
