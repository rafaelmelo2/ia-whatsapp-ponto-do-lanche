// ESLint flat config (ESLint 9). Typecheck-aware fica a cargo do `tsc`; aqui
// focamos em lint estilístico/segurança leve. `_legacy/` fica fora.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["node_modules/**", "**/dist/**", "_legacy/**", "src/**", "bun.lock"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["packages/**/*.ts", "services/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { Bun: "readonly" }
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
);
