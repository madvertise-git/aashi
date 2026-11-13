// Writes openapi.json from the operations list. With --check, fails instead if
// the committed file is out of date (CI runs this).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildOpenApiDocument } from "../src/openapi";

const file = fileURLToPath(new URL("../openapi.json", import.meta.url));
const next = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(file, "utf8");
  } catch {
    // Missing counts as out of date.
  }
  if (current !== next) {
    console.error("openapi.json is out of date. Run `pnpm openapi` and commit the result.");
    process.exit(1);
  }
  console.log("openapi.json is up to date.");
} else {
  writeFileSync(file, next);
  console.log("Wrote packages/contracts/openapi.json");
}
