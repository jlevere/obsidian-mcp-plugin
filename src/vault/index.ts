import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadHandler, description as readDescription } from "./read";
import {
  registerDiffEditHandler,
  description as diffEditDescription,
} from "./diff-edit";
import {
  registerSearchContentsHandler,
  description as searchContentsDescription,
} from "./search-contents";
import {
  registerSearchFilenamesHandler,
  description as searchFilenamesDescription,
} from "./search-filenames";
import {
  registerVaultTreeHandler,
  description as treeDescription,
} from "./vault-tree";
import {
  registerUpsertFileHandler,
  description as upsertDescription,
} from "./upsert";
import { ToolRegistry } from "../utils/types";

export const VAULT_TOOLS: ToolRegistry = {
  "read-file": registerReadHandler,
  "diff-edit-file": registerDiffEditHandler,
  "search-contents": registerSearchContentsHandler,
  "search-filenames": registerSearchFilenamesHandler,
  tree: registerVaultTreeHandler,
  "upsert-file": registerUpsertFileHandler,
};

// Map of tool names to their descriptions
export const TOOL_DESCRIPTIONS: Record<string, string> = {
  "read-file": readDescription,
  "diff-edit-file": diffEditDescription,
  "search-contents": searchContentsDescription,
  "search-filenames": searchFilenamesDescription,
  tree: treeDescription,
  "upsert-file": upsertDescription,
} as const;

export function registerVaultTools(app: App, mcpServer: McpServer) {
  registerReadHandler(app, mcpServer);
  registerDiffEditHandler(app, mcpServer);
  registerSearchContentsHandler(app, mcpServer);
  registerSearchFilenamesHandler(app, mcpServer);
  registerVaultTreeHandler(app, mcpServer);
  registerUpsertFileHandler(app, mcpServer);
}
