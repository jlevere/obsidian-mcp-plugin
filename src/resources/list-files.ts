import { App, TFile } from "obsidian";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerFileResources(app: App, mcpServer: McpServer) {
  // Resource 1: List all files in the vault
  mcpServer.resource(
    "Files List: Returns list of file resources.",
    new ResourceTemplate("files://", {
      list: () => {
        try {
          const files = app.vault.getFiles();
          return {
            resources: files.map((file: TFile) => ({
              name: file.name,
              uri: `file://${file.path}`,
              mimeType: "text/plain",
            })),
          };
        } catch (error) {
          console.error("Error listing files:", error);
          return { resources: [] };
        }
      },
    }),
    {
      mimeType: "application/json",
      description: "Lists all files in the Obsidian vault",
    },
    () => {
      return { contents: [] }; // List-only resource, no content for direct access
    },
  );

  // Resource 2: Read contents of a specific file
  mcpServer.resource(
    "File Contents: Reads the contents of a file given its path.",
    new ResourceTemplate("file://{file-path}", { list: undefined }),
    {
      mimeType: "text/plain",
      description: "Reads the contents of a file given its path",
    },
    async (uri: URL, variables) => {
      try {
        const filePath = variables["file-path"] as string;
        if (!filePath) {
          return {
            contents: [
              {
                uri: uri.toString(),
                text: JSON.stringify({ error: "No file path provided" }),
                mimeType: "application/json",
              },
            ],
            isError: true,
          };
        }

        const file = app.vault.getFiles().find((f: TFile) => f.path === filePath);
        if (!file) {
          return {
            contents: [
              {
                uri: uri.toString(),
                text: JSON.stringify({ error: `File not found: ${filePath}` }),
                mimeType: "application/json",
              },
            ],
            isError: true,
          };
        }

        const content = await app.vault.read(file);

        return {
          contents: [
            {
              uri: uri.toString(),
              text: content,
              mimeType: "text/plain",
            },
          ],
        };
      } catch (error) {
        console.error("Error reading file:", error);
        return {
          contents: [
            {
              uri: uri.toString(),
              text: JSON.stringify({ error: `${error}` }),
              mimeType: "application/json",
            },
          ],
          isError: true,
        };
      }
    },
  );
}
