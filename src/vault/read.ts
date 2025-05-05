import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSimilarFilesSuggestion } from "../utils/helpers";

export const description = `
Reads the content of a file from the Obsidian vault.
The file path should be relative to the root of the vault.
Returns the raw content of the file as plain text.
If the exact file is not found, will suggest similar files that might match.
`;

export function registerReadHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "read-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
    },
    async ({ path }) => {
      try {
        const normPath = normalizePath(path);
        const file = app.vault.getAbstractFileByPath(normPath);

        // If file not found, look for similar files
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

        // Verify it's a file not a folder
        if (!(file instanceof TFile)) {
          return {
            content: [
              {
                type: "text",
                text: `Path exists but is a folder: ${normPath}`,
              },
            ],
            isError: true,
          };
        }

        // Use cachedRead for better performance since we're only displaying content
        const content = await app.vault.cachedRead(file);

        return {
          content: [{ type: "text", text: content }],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reading file: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
