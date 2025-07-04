import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { saveRollback, getErrorMessage } from "../utils/helpers";

export const description = `
  Upserts a file in the vault. If the file doesn't exist, it is created with the provided content. 
  If it exists, the provided content is appended to the end of the file. The path will be normalized.`;

async function ensureFolder(app: App, folderPath: string) {
  try {
    await app.vault.createFolder(folderPath);
  } catch (err: unknown) {
    let alreadyExists = false;
    if (err && typeof err === "object" && "message" in err) {
      const msgString = getErrorMessage((err as { message?: unknown }).message);
      alreadyExists = msgString.includes("already exists");
    }
    if (!alreadyExists) {
      throw err;
    }
  }
}

export function registerUpsertFileHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-upsert-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
      content: z.string().describe("Content to insert or append to the file"),
    },
    async ({ path, content }) => {
      try {
        const normPath = normalizePath(path);
        const file = app.vault.getAbstractFileByPath(normPath);

        if (file) {
          if (!(file instanceof TFile)) {
            return {
              content: [
                {
                  type: "text",
                  text: `Provided normPath is a folder: ${normPath}`,
                },
              ],
              isError: true,
            };
          }

          await saveRollback(app, normPath, "upsert-file");

          await app.vault.process(file, currentData => {
            const base = currentData.endsWith("\n") ? currentData : currentData + "\n";
            return base + content;
          });

          return {
            content: [{ type: "text", text: `File updated: ${normPath}` }],
          };
        } else {
          const lastSlashIndex = normPath.lastIndexOf("/");
          if (lastSlashIndex !== -1) {
            const folderPath = normPath.substring(0, lastSlashIndex);
            await ensureFolder(app, folderPath);
          }

          await app.vault.create(normPath, content);
          return {
            content: [{ type: "text", text: `File created: ${normPath}` }],
          };
        }
      } catch (error: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error processing file upsert: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
