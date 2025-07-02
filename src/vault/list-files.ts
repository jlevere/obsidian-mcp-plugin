import { App, TFolder, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildVaultTree } from "../utils/helpers";

export const description = `
Lists files and directories in the Obsidian vault as a hierarchical structure.
If a directory path is provided via "dir", the listing is built for that directory.
If no path is provided, the vault root is used.
A "depth" parameter is available to limit how many subfolder levels to include.
A "limit" parameter is available to cap the number of results returned.
`;

export function registerListFilesHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-list-files",
    description,
    {
      dir: z
        .string()
        .optional()
        .describe(
          "Path to the directory in the vault to list; if omitted, the vault root is used.",
        ),
      depth: z
        .number()
        .int()
        .min(0)
        .optional()
        .transform(val => val ?? Infinity)
        .describe(
          "Recursion level for subfolders. Use 0 to return only the current folder, 1 to include immediate children, etc. Defaults to full recursion.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .transform(val => val ?? 20)
        .describe("Maximum number of files to return. Defaults to 20."),
    },
    async ({ dir, depth, limit }) => {
      try {
        const target = dir
          ? app.vault.getAbstractFileByPath(normalizePath(dir))
          : app.vault.getRoot();

        if (!target || !(target instanceof TFolder)) {
          return {
            content: [
              {
                type: "text",
                text: `Directory not found or is not a folder: ${normalizePath(dir || "/")}`,
              },
            ],
            isError: true,
          };
        }

        const tree = await buildVaultTree(app, target, {
          maxDepth: depth,
          maxResults: limit,
        });

        if (!tree) {
          return {
            content: [
              {
                type: "text",
                text: `Failed to build file listing for: ${normalizePath(dir || "/")}`,
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing files: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
