import { runMigrations } from "@aashi/db";

/** Brings the test database up to date before any test runs. */
export default async function setup(): Promise<void> {
  await runMigrations(
    process.env.TEST_DATABASE_OWNER_URL ?? "postgres://platform_owner:owner_dev_password@localhost:5432/aashi_test",
  );
}
