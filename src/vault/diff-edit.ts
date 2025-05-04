import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  makePatches,
  applyPatches,
  stringifyPatches,
  match,
} from "@sanity/diff-match-patch";
import { saveRollback, getSimilarFilesSuggestion } from "../utils/helpers";

export const description = `
Please provide a patch like this:

- **original**: an exact, copy-pasted snippet from your file — include 
enough surrounding lines to give unique context so the tool can reliably fuzzy-match it.
- \"updated\" should be the new version you want to replace it with.

- Do **not** change anything outside the specified block.

Example:

    {
      "original": "def greet():\n    return 'Hello'",
      "updated": "def greet():\n    return 'Hi there!'"
    }
`;

function normalizeText(str: string): string {
  return str.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function getAnchors(
  text: string
): { anchor: string; offset: number; label: string }[] {
  const len = text.length;
  if (len <= 32) {
    return [{ anchor: text, offset: 0, label: "head" }];
  }
  const head = text.slice(0, 32);
  const midStart = Math.floor((len - 32) / 2);
  const mid = text.slice(midStart, midStart + 32);
  const tail = text.slice(len - 32);
  return [
    { anchor: head, offset: 0, label: "head" },
    { anchor: mid, offset: midStart, label: "mid" },
    { anchor: tail, offset: len - 32, label: "tail" },
  ];
}

export function registerDiffEditHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "diff-edit-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
      original: z
        .string()
        .min(1)
        .describe(
          "The section you want to replace (copied exactly from the file)"
        ),
      updated: z
        .string()
        .describe("The new content to replace the original section with"),
    },
    async ({ path, original, updated }) => {
      try {
        const normPath = normalizePath(path);
        const file = app.vault.getAbstractFileByPath(normPath);
        if (!file) {
          const suggestions = getSimilarFilesSuggestion(app, normPath);
          return {
            content: [
              {
                type: "text",
                text: `File not found: ${normPath}${suggestions}`,
              },
            ],
            isError: true,
          };
        }
        if (!(file instanceof TFile)) {
          return {
            content: [
              { type: "text", text: `Provided path is a folder: ${normPath}` },
            ],
            isError: true,
          };
        }
        let fileContent = await app.vault.read(file);
        fileContent = normalizeText(fileContent);
        const normOriginal = normalizeText(original);
        const normUpdated = normalizeText(updated);

        // Save rollback before modifying
        await saveRollback(app, normPath, "diff-edit-file");

        if (!fileContent) {
          await app.vault.modify(file, normUpdated);
          const diffString = stringifyPatches(makePatches("", normUpdated));
          return {
            content: [
              {
                type: "text",
                text: `File was empty. Wrote new content.\nDiff applied:\n${diffString}`,
              },
            ],
            result: {
              diff: diffString,
              anchor: null,
            },
          };
        }

        // Extract anchors
        const anchors = getAnchors(normOriginal);
        let best = {
          idx: -1,
          anchor: null as null | string,
          offset: 0,
          label: "",
        };
        for (const { anchor, offset, label } of anchors) {
          if (!anchor) continue;
          let idx = -1;
          if (anchor.length <= 32) {
            idx = match(fileContent, anchor, 0);
          }
          if (idx !== -1) {
            best = { idx, anchor, offset, label };
            break; // Prefer first found anchor
          }
        }
        if (best.idx === -1) {
          return {
            content: [
              {
                type: "text",
                text: `Could not find a close enough match for any anchor in the file.`,
              },
            ],
            isError: true,
          };
        }
        // Compute block start, clamp within [0, fileLength]
        let blockStart = best.idx - best.offset;
        blockStart = Math.max(
          0,
          Math.min(blockStart, fileContent.length - normOriginal.length)
        );
        const fileSlice = fileContent.slice(
          blockStart,
          blockStart + normOriginal.length
        );
        // Validate fuzzy distance (patch count threshold)
        const patchThreshold = Math.ceil(normOriginal.length / 32);
        const validationPatches = makePatches(fileSlice, normOriginal);
        if (validationPatches.length > patchThreshold) {
          return {
            content: [
              {
                type: "text",
                text: `Located block is too different from the original (patch steps: ${validationPatches.length}, threshold: ${patchThreshold}).`,
              },
            ],
            isError: true,
          };
        }
        // Patch & merge
        const patches = makePatches(fileSlice, normUpdated);
        const [patchedSection] = applyPatches(patches, fileSlice);
        const newContent =
          fileContent.slice(0, blockStart) +
          patchedSection +
          fileContent.slice(blockStart + normOriginal.length);
        const diffString = stringifyPatches(
          makePatches(fileContent, newContent)
        );
        await app.vault.modify(file, newContent);
        return {
          content: [
            {
              type: "text",
              text: `Diff applied (anchor: ${best.label}, offset: ${best.offset}, idx: ${best.idx}).\nDiff:\n${diffString}`,
            },
          ],
          result: {
            diff: diffString,
            anchor: best.label,
          },
        };
      } catch (err: any) {
        const msg =
          err && typeof err === "object" && "message" in err
            ? err.message
            : String(err);
        return {
          content: [{ type: "text", text: `Error processing diff: ${msg}` }],
          isError: true,
        };
      }
    }
  );
}
