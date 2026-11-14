import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Module boundaries: a module may reach another module only through its
    // index.ts (its "facade"), never through its internal files.
    files: ["apps/api/src/modules/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./(?!\\.\\.)[^/]+/.+",
              message: "Import other modules through their index.ts facade, not their internal files.",
            },
            {
              // Business code sees the socket's interface, never a particular provider's adapter.
              regex: "/sockets/.+",
              message: "Import sockets through src/sockets/index.ts. Modules must not depend on a stand-in or a real adapter.",
            },
          ],
        },
      ],
    },
  },
  {
    // The shared platform layer must not depend on business modules.
    files: ["apps/api/src/platform/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: "/modules/", message: "platform/ must not import from modules/." }] },
      ],
    },
  },
);
