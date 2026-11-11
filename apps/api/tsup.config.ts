import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  // Workspace packages ship as TypeScript source, so bundle them in.
  noExternal: [/^@aashi\//],
});
