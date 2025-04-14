import { App, TFile, TFolder, TAbstractFile } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const description = `
Returns a hierarchical tree representation of a directory in the Obsidian vault.
If a directory path is provided via "dir", the tree is built for that directory.
If no path is provided, the vault root is used.
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
    },
    async ({ dir }) => {
      try {
        let target: TAbstractFile;
        if (dir) {
          target = app.vault.getAbstractFileByPath(dir);
          if (!target || !(target instanceof TFolder)) {
            return {
              content: [
                {
                  type: "text",
                  text: `Directory not found or is not a folder: ${dir}`,
                },
              ],
              isError: true,
            };
          }
        } else {
          target = app.vault.getRoot();
        }

        function buildTree(file: TAbstractFile): any {
          if (file instanceof TFile) {
            return { name: file.name, type: "file" };
          } else if (file instanceof TFolder) {
            const children = file.children.map((child) => buildTree(child));
            return { name: file.name, type: "folder", children };
          }
        }

        const tree = buildTree(target);

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
