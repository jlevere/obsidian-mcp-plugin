import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { resolveTFileOrError } from "../utils/helpers";

export const description = `
Reads the content of a file from the Obsidian vault.
The file path should be relative to the root of the vault.
Returns the raw content of the file as plain text.
If the exact file is not found, will suggest similar files that might match.
`;

export function registerReadHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-read-file",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
    },
    async ({ path }) => {
      try {
        const result = resolveTFileOrError(app, path);
        if ("error" in result) return result;
        const { file } = result;

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
              text: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
