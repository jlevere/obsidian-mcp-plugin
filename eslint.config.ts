import eslint from "@eslint/js";
import tsEslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default tsEslint.config(
  {
    name: "Global Ignore",
    ignores: [
      "node_modules/",
      "dist/",
      "eslint.config.ts",
      "obs-api.d.ts",
      "mocks/obsidian.ts",
      "main.js",
      "tests/**/*.ts",
    ],
  },
  eslint.configs.recommended,
  tsEslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
