import { ObsidianMcpSettings } from "@types";

export const DEFAULT_SETTINGS: ObsidianMcpSettings = {
  port: 3000,
  bindingHost: "127.0.0.1",
  disabledTools: [],
  enableDynamicTools: false,
  dynamicToolsPath: "metadata/schemas",
  enableAuth: false,
  authToken: "",
};

export const PLUGIN_NAME = "Vault MCP";
export const PLUGIN_ID = "vault-mcp";
