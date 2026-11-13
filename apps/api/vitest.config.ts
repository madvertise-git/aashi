import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    // The tests share one database; run files one after another.
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://platform_app:app_dev_password@localhost:5432/aashi_test",
      AUTH_DATABASE_URL:
        process.env.TEST_AUTH_DATABASE_URL ?? "postgres://platform_auth:auth_dev_password@localhost:5432/aashi_test",
      // Each run gets its own corner of Redis, so old sessions and rate-limit counts never carry over.
      KEY_PREFIX: `test-${Date.now()}`,
    },
  },
});
