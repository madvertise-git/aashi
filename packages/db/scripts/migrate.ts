import { runMigrations } from "../src/migrate";

const url = process.env.DATABASE_OWNER_URL ?? "postgres://platform_owner:owner_dev_password@localhost:5432/aashi";
await runMigrations(url);
console.log("Migrations applied.");
