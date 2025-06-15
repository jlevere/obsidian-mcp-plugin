import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getErrorMessage, resolveTFileOrError, saveRollback } from "../utils/helpers";
import { createPatch } from "diff";

/**
 * Apply a unified diff to the given original content.
 * @param path - The file path that the diff is intended for.
 * @param udiff - The unified diff string
 * @param originalContent - The original content of the file.
 * @returns An object with the updated file content and a unified diff string of the changes that were applied.
 * @throws Error if the diff is invalid, targets multiple files, or cannot be applied.
 */
function applyDiff(
  path: string,
  udiff: string,
  originalContent: string,
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
    throw new Error(`Diff targets two different files ('${oldFile}' vs '${newFile}').`);
  }
  if (stripPrefix(path) !== oldFilePath) {
    throw new Error(`Diff file path (${oldFilePath}) does not match provided path (${path}).`);
  }
  // Ensure only one file is present in diff (no additional '---' lines beyond the first pair)
  const otherFileIndex = diffLines.slice(2).findIndex(line => line.startsWith("---"));
  if (otherFileIndex !== -1) {
    throw new Error("Diff targets multiple files; only single-file diffs are supported.");
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
      (hunkLines[hunkLines.length - 1] === "" || hunkLines[hunkLines.length - 1] === " ")
    ) {
      searchBlock += "\n";
      replaceBlock += "\n";
    }
    const idx = updated.indexOf(searchBlock);
    if (idx < 0) {
      throw new Error(`Hunk failed to apply; could not find:\n${searchBlock}`);
    }
    updated = updated.slice(0, idx) + replaceBlock + updated.slice(idx + searchBlock.length);
  }

  // 4) Emit final diff
  const result = createPatch(path, originalContent, updated);
  if (result == null) throw new Error("Failed to stringify patches");
  return { updated, diff: `--- ${path}\n+++ ${path}\n` + result };
}

export const description = `
Edit a single file by applying a unified diff.

This tool takes a path to a file to edit and the diff to apply to it.

You must generate a clean, minimal patch that applies successfully to the current file content.

# Instructions for generating diffs:

- Format your response using unified diff format (like \`diff -U0\`, but without line numbers or timestamps).
- Always begin with exactly two header lines:
  \`--- path/to/file.ext\`  
  \`+++ path/to/file.ext\`
- Then, for each change, include a hunk header line starting with \`@@\`. Line numbers are optional and ignored.
- Inside hunks:
  - Prefix unchanged lines with a space: \` \`
  - Prefix deleted lines with a dash: \`-\`
  - Prefix added lines with a plus: \`+\`
- Only include hunks with actual changes — skip hunks with only context lines.
- Indentation and spacing must be exact.
- If you're moving content, use one hunk to remove and one hunk to re-add it at the new location.

# Example:

\`\`\`diff
--- example.md
+++ example.md
@@ ... @@
-Old line of text
+New line of text
\`\`\`

This tool will apply your patch and return a new unified diff showing what actually changed. Make sure your patch applies cleanly — if it doesn't match the file exactly, the edit will fail.

Rollback the change with the rollback tool if you need to.
`;

export function registerDiffEditHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-diff-edit-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
      udiff: z.string().describe("Unified diff block to apply (not fenced)."),
    },
    async ({ path, udiff }) => {
      const result = resolveTFileOrError(app, path);
      if ("error" in result) return result;
      const { file, normPath } = result;

      const fileContent = await app.vault.read(file);
      await saveRollback(app, normPath, "obsidian-mcp-diff-edit-file");
      try {
        const { updated, diff } = applyDiff(normPath, udiff, fileContent);
        await app.vault.modify(file, updated);
        return {
          content: [{ type: "text", text: diff }],
          isError: false,
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error applying diff: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
