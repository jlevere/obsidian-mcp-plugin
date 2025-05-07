import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveRollback } from "../utils/helpers";
import { createPatch } from "diff";

/**
 * Apply a unified diff to the given original content.
 * @param path - The file path that the diff is intended for.
 * @param udiff - The unified diff string (in Aider's simplified format).
 * @param originalContent - The original content of the file.
 * @returns An object with the updated file content and a unified diff string of the changes that were applied.
 * @throws Error if the diff is invalid, targets multiple files, or cannot be applied.
 */
function applyDiff(
  path: string,
  udiff: string,
  originalContent: string
): { updated: string; diff: string } {
  // 1) Strip diff fences (```diff ... ```) and normalize newlines.  We dont intend to use fences,
  // but we will accept them if provided.
  const clean = udiff.replace(/^```diff\s*|```$/gm, "");
  const diffLines = clean.split(/\r?\n/);

  // 2) Validate headers
  if (!diffLines[0].startsWith("---") || !/^\+\+\+\s/.test(diffLines[1])) {
    throw new Error("Missing ---/+++ headers");
  }
  // Only remove one leading a/ or b/ prefix
  const stripPrefix = (p: string) => p.replace(/^([ab]\/)*/, "");
  const oldFile = diffLines[0].replace(/^---\s*/, "");
  const newFile = diffLines[1].replace(/^\+\+\+\s*/, "");
  const oldFilePath = stripPrefix(oldFile);
  const newFilePath = stripPrefix(newFile);
  if (oldFilePath !== newFilePath) {
    throw new Error(
      `Diff targets two different files ('${oldFile}' vs '${newFile}').`
    );
  }
  if (stripPrefix(path) !== oldFilePath) {
    throw new Error(
      `Diff file path (${oldFilePath}) does not match provided path (${path}).`
    );
  }
  // Ensure only one file is present in diff (no additional '---' lines beyond the first pair)
  const otherFileIndex = diffLines
    .slice(2)
    .findIndex((line) => line.startsWith("---"));
  if (otherFileIndex !== -1) {
    throw new Error(
      "Diff targets multiple files; only single-file diffs are supported."
    );
  }

  // 3) Apply each hunk by walking lines in order
  let updated = originalContent.replace(/\r\n/g, "\n");
  let cursor = 2;
  while (cursor < diffLines.length) {
    const header = diffLines[cursor++];
    if (!/^@@.*@@/.test(header)) {
      if (header.trim() === "") continue; // skip blank lines between hunks
      throw new Error(`Expected hunk header at line ${cursor}: ${header}`);
    }
    // collect hunk lines
    const hunkLines: string[] = [];
    while (
      cursor < diffLines.length &&
      !/^@@/.test(diffLines[cursor]) &&
      !/^---/.test(diffLines[cursor])
    ) {
      hunkLines.push(diffLines[cursor++]);
    }
    // build search & replace in one pass
    const searchLines: string[] = [];
    const replaceLines: string[] = [];
    for (const h of hunkLines) {
      if (!h) continue; // allow truly empty lines
      const c = h.slice(1);
      switch (h[0]) {
        case " ":
          searchLines.push(c);
          replaceLines.push(c);
          break;
        case "-":
          searchLines.push(c);
          break;
        case "+":
          replaceLines.push(c);
          break;
        default:
          /* skip */ break;
      }
    }
    let searchBlock = searchLines.join("\n");
    let replaceBlock = replaceLines.join("\n");
    // preserve trailing newline if needed
    if (
      hunkLines.length > 0 &&
      (hunkLines[hunkLines.length - 1] === "" ||
        hunkLines[hunkLines.length - 1] === " ")
    ) {
      searchBlock += "\n";
      replaceBlock += "\n";
    }
    const idx = updated.indexOf(searchBlock);
    if (idx < 0) {
      throw new Error(`Hunk failed to apply; could not find:\n${searchBlock}`);
    }
    updated =
      updated.slice(0, idx) +
      replaceBlock +
      updated.slice(idx + searchBlock.length);
  }

  // 4) Emit final diff
  const result = createPatch(path, originalContent, updated);
  if (result == null) throw new Error("Failed to stringify patches");
  return { updated, diff: `--- ${path}\n+++ ${path}\n` + result };
}

export const description = `
Apply a unified diff to a single file in the vault. Changes are applied and the resulting diff is returned.

Apply a unified diff to a single file in the vault. The diff must be in unified diff format (--- path, +++ path, @@ hunk headers, context/add/remove lines). Example:

--- path/to/file.md
+++ path/to/file.md
@@
 context line
-context to remove
+context to add
 context line
`;

export function registerDiffEditHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "diff-edit-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
      udiff: z.string().describe("Unified diff block to apply (not fenced)."),
    },
    async ({ path, udiff }) => {
      const normPath = normalizePath(path);
      const file = app.vault.getAbstractFileByPath(normPath);
      if (!file || !(file instanceof TFile)) {
        return {
          content: [
            { type: "text", text: `File not found or not a file: ${normPath}` },
          ],
          isError: true,
        };
      }
      let fileContent = await app.vault.read(file);
      await saveRollback(app, normPath, "diff-edit-file");
      try {
        const { updated, diff } = applyDiff(normPath, udiff, fileContent);
        await app.vault.adapter.write(normPath, updated);
        return {
          content: [{ type: "text", text: diff }],
          isError: false,
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error applying diff: ${err.message || err}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
