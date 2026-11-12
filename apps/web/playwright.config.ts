import { defineConfig } from "@playwright/test";

// Starts the API and the web app, then drives a real browser through them.
// Needs the database running and migrated (pnpm db:migrate).
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "off" },
  webServer: [
    { command: "pnpm --filter @aashi/api dev", url: "http://localhost:4000/readyz", reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: "pnpm --filter @aashi/web dev", url: "http://localhost:3000/sign-in", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
