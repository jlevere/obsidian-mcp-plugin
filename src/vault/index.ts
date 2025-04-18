import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerReadHandler } from "./read";
import { registerDiffEditHandler } from "./diff-edit";
import { registerFuzzySearchHandler } from "./fuzzy-search";
import { registerVaultTreeHandler } from "./tree";
import { registerUpsertFileHandler } from "./upsert";
import { registerUpdateMachineHandler } from "./update-machine";
import { registerUpdateUserHandler } from "./update-user";
import { registerUpdateClientHandler } from "./update-client";
import { registerUpdateDomainHandler } from "./update-domain";
import { registerGetSchemasHandler } from "./get-schemas";

export function registerVaultTools(app: App, mcpServer: McpServer) {
  registerReadHandler(app, mcpServer);
  registerDiffEditHandler(app, mcpServer);
  registerFuzzySearchHandler(app, mcpServer);
  registerVaultTreeHandler(app, mcpServer);
  registerUpsertFileHandler(app, mcpServer);
  registerUpdateMachineHandler(app, mcpServer);
  registerUpdateUserHandler(app, mcpServer);
  registerUpdateClientHandler(app, mcpServer);
  registerUpdateDomainHandler(app, mcpServer);
  registerGetSchemasHandler(app, mcpServer);
}
