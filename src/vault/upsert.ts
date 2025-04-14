import { App, TFile } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const description = `
Upserts a file in the vault. If the file doesn't exist, it is created with the provided content.
If it exists, the provided content is appended to the end of the file.

FILENAME MUST END IN '.md' MUST BE MARKDOWN EXTENTION
`;

export function registerUpsertFileHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "upsert-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
      content: z.string().describe("Content to insert or append to the file"),
    },
    async ({ path, content }) => {
      try {
        const file = app.vault.getAbstractFileByPath(path);

        if (file) {
          if (!(file instanceof TFile)) {
            return {
              content: [
                { type: "text", text: `Provided path is a folder: ${path}` },
              ],
              isError: true,
            };
          }

          let fileContents = await app.vault.read(file);
          if (!fileContents.endsWith("\n")) {
            fileContents += "\n";
          }
          fileContents += content;

          await app.vault.adapter.write(path, fileContents);
          return {
            content: [{ type: "text", text: `File updated: ${path}` }],
          };
        } else {
          const lastSlashIndex = path.lastIndexOf("/");
          if (lastSlashIndex !== -1) {
            const folderPath = path.substring(0, lastSlashIndex);
            try {
              await app.vault.createFolder(folderPath);
            } catch (err) {}
          }

          await app.vault.create(path, content);
          return {
            content: [{ type: "text", text: `File created: ${path}` }],
          };
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error processing file upsert: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
