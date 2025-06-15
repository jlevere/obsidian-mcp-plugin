import { App, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { restoreRollback } from "../utils/helpers";

export const description = `
Rollback the last edit to a markdown file, if a rollback is available.
Restores the file content to the last saved state before a file-writing tool modified it.
`;

export function registerRollbackEditHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-rollback-edit",
    description,
    {
      path: z.string().describe("Path to the markdown file in the vault to rollback"),
    },
    async ({ path }) => {
      const normPath = normalizePath(path);
      if (!normPath.endsWith(".md")) {
        return {
          content: [{ type: "text", text: `Only .md files can be rolled back.` }],
          isError: true,
        };
      }
      const result = await restoreRollback(app, normPath);
      if (result.success) {
        return {
          content: [{ type: "text", text: result.message }],
        };
      } else {
        return {
          content: [{ type: "text", text: result.message }],
          isError: true,
        };
      }
    },
  );
}
