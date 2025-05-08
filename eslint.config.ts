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
    ],
  },
  eslint.configs.recommended,
  tsEslint.configs.recommendedTypeChecked,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.test.json",
      },
    },
  }
);
