import { tablesWithoutForcedRls } from "../src/rls";

const url = process.env.DATABASE_OWNER_URL ?? "postgres://platform_owner:owner_dev_password@localhost:5432/aashi";
const missing = await tablesWithoutForcedRls(url);
if (missing.length > 0) {
  console.error(`Tables without forced row-level security:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log("Every table has row-level security enabled and forced.");
