import { App, TFile } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
//import { getFileMetadataObject } from "../utils/helpers";

const description = `
Reads the content of a file from the Obsidian vault.
The file path should be relative to the root of the vault.
Returns the raw content of the file as plain text.
`;

export function registerReadHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "read",
    description,
    {
      path: z.string().describe("Path to the file in the vault"),
    },
    async ({ path }) => {
      try {
        const file = app.vault.getAbstractFileByPath(path);
        if (!file || !(file instanceof TFile)) {
          return {
            content: [{ type: "text", text: `File not found: ${path}` }],
            isError: true,
          };
        }

        const content = await app.vault.read(file);
        //const fileMetadata = await getFileMetadataObject(app, file);

        return {
          content: [
            { type: "text", text: content },
            //{ type: "resource", resource: { json: fileMetadata } },
            //TODO: id like to include a reference to a resource with the file meatadata
            // This would need to be a solid reference uri and all that as in
            // https://modelcontextprotocol.io/specification/2024-11-05/server/tools#embedded-resources
          ],
        };
      } catch (error) {
        return {
          content: [
            { type: "text", text: `Error reading file: ${error.message}` },
          ],
          isError: true,
        };
      }
    }
  );
}
