import { App, TFile, TFolder, TAbstractFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const description = `
Returns a hierarchical tree representation of a directory in the Obsidian vault.
If a directory path is provided via "dir", the tree is built for that directory.
If no path is provided, the vault root is used.
A "depth" parameter is available to limit how many subfolder levels to include.
`;

export function registerVaultTreeHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "vault-tree",
    description,
    {
      dir: z
        .string()
        .optional()
        .describe(
          "Path to the directory in the vault to tree; if omitted, the vault root is used."
        ),
      depth: z
        .number()
        .optional()
        .describe(
          "Recursion level for subfolders. Use 0 to return only the current folder, 1 to include immediate children, etc. Defaults to full recursion if omitted."
        ),
    },
    async ({ dir, depth }) => {
      const maxDepth = typeof depth === "number" ? depth : Infinity;
      try {
        let target: TAbstractFile;
        if (dir) {
          const normalizedDir = normalizePath(dir);
          target = app.vault.getAbstractFileByPath(normalizedDir);
          if (!target || !(target instanceof TFolder)) {
            return {
              content: [
                {
                  type: "text",
                  text: `Directory not found or is not a folder: ${normalizedDir}`,
                },
              ],
              isError: true,
            };
          }
        } else {
          target = app.vault.getRoot();
        }

        function buildTree(file: TAbstractFile, depth: number): any {
          if (file instanceof TFile) {
            return { name: file.name, type: "file" };
          } else if (file instanceof TFolder) {
            if (depth === 0) {
              return { name: file.name, type: "folder" };
            }
            const children = file.children.map((child) =>
              buildTree(child, depth - 1)
            );
            return { name: file.name, type: "folder", children };
          }
        }

        const tree = buildTree(target, maxDepth);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(tree, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error building directory tree: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
