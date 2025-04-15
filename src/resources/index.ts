import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVaultMapResource } from "./vault-map";

export function registerResources(app: App, mcpServer: McpServer) {
  registerVaultMapResource(app, mcpServer);
}
