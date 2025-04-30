import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerVaultMapResource,
  metadata as vaultMapMetadata,
} from "./vault-map";
import {
  registerActiveFileResource,
  metadata as activeFileMetadata,
} from "./active-file";
import { ToolRegistry } from "../utils/types";

export const VAULT_RESOURCES: ToolRegistry = {
  "vault-map": registerVaultMapResource,
  "active-file": registerActiveFileResource,
};

export const RESOURCE_DESCRIPTIONS: Record<string, string> = {
  "vault-map": vaultMapMetadata.description as string,
  "active-file": activeFileMetadata.description as string,
} as const;

export function registerResources(app: App, mcpServer: McpServer) {
  registerVaultMapResource(app, mcpServer);
  registerActiveFileResource(app, mcpServer);
}
