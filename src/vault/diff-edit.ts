import { App, TFile } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  makePatches,
  applyPatches,
  stringifyPatches,
} from "@sanity/diff-match-patch";

export function registerDiffEditHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian/vault/diff-edit",
    {
      path: z.string().describe("Path to the file in the vault"),
      changes: z
        .string()
        .describe(
          "The changes you want to apply (partial content to be integrated)"
        ),
    },
    async ({ path, changes }) => {
      try {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
          return {
            content: [{ type: "text", text: `File not found: ${path}` }],
            isError: true,
          };
        }

        // Read the current content of the file
        const originalContent = await app.vault.read(file);

        // Create patches to transform the original content
        // This is a smart diff that will try to find the best matches
        // and only change what's necessary
        const patches = makePatches(originalContent, changes);

        // Apply the patches to get the new content
        const [newContent, results] = applyPatches(patches, originalContent);

        // Create a diff string representation
        const diffString = stringifyPatches(patches);

        // Write the new content back to the file
        await app.vault.modify(file, newContent);

        return {
          content: [
            {
              type: "text",
              text: `Diff applied:\n${diffString}`,
            },
          ],
          result: {
            diff: diffString,
          },
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error processing diff: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
