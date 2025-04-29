import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadHandler } from "./read";
import { registerDiffEditHandler } from "./diff-edit";
import { registerFuzzySearchHandler } from "./fuzzy-search";
import { registerVaultTreeHandler } from "./tree";
import { registerUpsertFileHandler } from "./upsert";
import { registerGetSchemasHandler } from "./get-schemas";
import { ToolRegistry } from "../utils/types";

// Define available vault tools and their registration functions
export const VAULT_TOOLS: ToolRegistry = {
  'read-file': registerReadHandler,
  'diff-edit-file': registerDiffEditHandler,
  'fuzzy-search': registerFuzzySearchHandler,
  'vault-tree': registerVaultTreeHandler,
  'upsert-file': registerUpsertFileHandler,
  'get-schemas': registerGetSchemasHandler,
};

export function registerVaultTools(app: App, mcpServer: McpServer) {
  registerReadHandler(app, mcpServer);
  registerDiffEditHandler(app, mcpServer);
  registerFuzzySearchHandler(app, mcpServer);
  registerVaultTreeHandler(app, mcpServer);
  registerUpsertFileHandler(app, mcpServer);
  registerGetSchemasHandler(app, mcpServer);
}
