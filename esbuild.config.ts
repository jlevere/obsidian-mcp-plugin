import esbuild, { BuildOptions } from "esbuild";
import process from "process";
import builtins from "builtin-modules";
import { mkdirSync } from "fs";
import { dirname } from "path";
import TsconfigPathsPlugin from "@esbuild-plugins/tsconfig-paths";

const banner = `/*
THIS IS A GENERATED/BUNDLED FILE BY ESBUILD
if you want to view the source, please visit the github repository of this plugin
*/
`;

const prod = process.argv[2] === "production";
const watch = process.argv[2] === "watch";
const outfile = prod ? "dist/main.js" : "main.js";

mkdirSync(dirname(outfile), { recursive: true });

const options: BuildOptions = {
  banner: {
    js: banner,
  },
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/closebrackets",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/comment",
    "@codemirror/fold",
    "@codemirror/gutter",
    "@codemirror/highlight",
    "@codemirror/history",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/matchbrackets",
    "@codemirror/panel",
    "@codemirror/rangeset",
    "@codemirror/rectangular-selection",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/stream-parser",
    "@codemirror/text",
    "@codemirror/tooltip",
    "@codemirror/view",
    ...builtins,
  ],
  format: "cjs",
  target: "es6",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: true,
  outfile,
  plugins: [TsconfigPathsPlugin({ tsconfig: "./tsconfig.json" })],
};

async function run(): Promise<void> {
  try {
    if (prod || !watch) {
      await esbuild.build(options);
    } else {
      const ctx = await esbuild.context(options);
      await ctx.watch();
    }
  } catch {
    process.exit(1);
  }
}

void run();
