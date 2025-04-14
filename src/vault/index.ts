import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadHandler } from "./read";
import { registerDiffEditHandler } from "./diff-edit";
import { registerFuzzySearchHandler } from "./fuzzy-search";

export function registerVaultTools(app: App, mcpServer: McpServer) {
  registerReadHandler(app, mcpServer);
  registerDiffEditHandler(app, mcpServer);
  registerFuzzySearchHandler(app, mcpServer);
}
