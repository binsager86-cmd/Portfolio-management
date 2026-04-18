import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  // Global ignores (replaces ignorePatterns)
  { ignores: ["node_modules/", ".expo/", "dist/", "web-build/", "**/*.js"] },

  // Base recommended rules
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide settings
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      "max-lines": ["error", { max: 350, skipBlankLines: true, skipComments: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/ban-ts-comment": "off",
      "no-console": "warn",
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["**/services/api.ts"], message: "Import from @/services/api (barrel) instead." },
          { group: ["**/services/api.old*"], message: "Legacy API file deleted — use @/services/api." },
        ],
      }],
    },
  },
);
