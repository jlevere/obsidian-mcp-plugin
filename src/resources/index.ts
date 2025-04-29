import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerVaultMapResource } from "./vault-map";
import { registerActiveFileResource } from "./active-file";
import { ToolRegistry } from "../utils/types";

// Define available resources and their registration functions
export const VAULT_RESOURCES: ToolRegistry = {
  'vault-map': registerVaultMapResource,
  'active-file': registerActiveFileResource,
};

export function registerResources(app: App, mcpServer: McpServer) {
  registerVaultMapResource(app, mcpServer);
  registerActiveFileResource(app, mcpServer);
}
