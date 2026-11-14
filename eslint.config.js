import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/",
      ".wrangler/",
      "public/styles.css",
      "worker-configuration.d.ts",
      "migrations/",
      "test-results/",
      "playwright-report/",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Used only right after a check the type system cannot follow (a lookup in a map just filled, a found row).
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  {
    files: ["public/**/*.js", "eslint.config.js", "e2e/**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      globals: {
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        fetch: "readonly",
        FormData: "readonly",
        HTMLFormElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        createImageBitmap: "readonly",
        File: "readonly",
        DataTransfer: "readonly",
        Element: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        alert: "readonly",
        location: "readonly",
        indexedDB: "readonly",
        crypto: "readonly",
        Event: "readonly",
        self: "readonly",
        caches: "readonly",
        Response: "readonly",
        URL: "readonly",
        process: "readonly",
        console: "readonly",
      },
    },
  },
);
