import { ObsidianMcpSettings } from "./utils/types";

export const DEFAULT_SETTINGS: ObsidianMcpSettings = {
  port: 3000,
  bindingHost: "0.0.0.0",
  disabledTools: [],
  enableDynamicTools: false,
  dynamicToolsPath: "metadata/schemas"
};

export const PLUGIN_NAME = "Obsidian MCP";
export const PLUGIN_ID = "obsidian-mcp-plugin";
