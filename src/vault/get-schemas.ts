import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const description = `
Returns a list of all schemas in the vault. Schemas are expected to be located in the 'Metadata/Schemas/' directory.
`;

export function registerGetSchemasHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "get-schemas",
    description,
    {}, // No input arguments needed
    async () => {
      const schemaDir = "Metadata/Schemas/";
      try {
        const allFiles = app.vault.getFiles();
        const schemaFiles = allFiles
          .filter(file => file.path.startsWith(schemaDir) && file.path.toLowerCase().endsWith(".md"))
          .map(file => ({ type: "text" as const, text: file.path }));

        if (schemaFiles.length === 0) {
          return { content: [{ type: "text" as const, text: `No schema files found in ${schemaDir}` }] };
        }

        return { content: schemaFiles };

      } catch (err) {
        console.error("Error fetching schema files:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error fetching schema files: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}
