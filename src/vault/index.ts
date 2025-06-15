import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadHandler, description as readDescription } from "./read";
import { registerDiffEditHandler, description as diffEditDescription } from "./diff-edit";
import {
  registerSearchContentsHandler,
  description as searchContentsDescription,
} from "./search-contents";
import {
  registerSearchFilenamesHandler,
  description as searchFilenamesDescription,
} from "./search-filenames";
import { registerListFilesHandler, description as listFilesDescription } from "./list-files";
import { registerUpsertFileHandler, description as upsertDescription } from "./upsert";
import {
  registerRollbackEditHandler,
  description as rollbackEditDescription,
} from "./rollback-edit";
import { ToolRegistry } from "@types";

export const VAULT_TOOLS: ToolRegistry = {
  "obsidian-mcp-read-file": registerReadHandler,
  "obsidian-mcp-diff-edit-file": registerDiffEditHandler,
  "obsidian-mcp-search-contents": registerSearchContentsHandler,
  "obsidian-mcp-search-filenames": registerSearchFilenamesHandler,
  "obsidian-mcp-list-files": registerListFilesHandler,
  "obsidian-mcp-upsert-file": registerUpsertFileHandler,
  "obsidian-mcp-rollback-edit": registerRollbackEditHandler,
};

// Map of tool names to their descriptions
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  "obsidian-mcp-read-file": readDescription,
  "obsidian-mcp-diff-edit-file": diffEditDescription,
  "obsidian-mcp-search-contents": searchContentsDescription,
  "obsidian-mcp-search-filenames": searchFilenamesDescription,
  "obsidian-mcp-list-files": listFilesDescription,
  "obsidian-mcp-upsert-file": upsertDescription,
  "obsidian-mcp-rollback-edit": rollbackEditDescription,
} as const;

export function registerVaultTools(app: App, mcpServer: McpServer) {
  registerReadHandler(app, mcpServer);
  registerDiffEditHandler(app, mcpServer);
  registerSearchContentsHandler(app, mcpServer);
  registerSearchFilenamesHandler(app, mcpServer);
  registerListFilesHandler(app, mcpServer);
  registerUpsertFileHandler(app, mcpServer);
  registerRollbackEditHandler(app, mcpServer);
}
