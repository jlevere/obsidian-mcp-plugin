import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VAULT_TOOLS } from "../vault/index";
import { VAULT_RESOURCES } from "../resources";
import { findAndParseSchemas } from "../schema-manager";
import { generateZodSchema, handleGenericUpdate } from "../dynamic-tool-handler";
import { ObsidianMcpSettings } from "../utils/types";

export class ToolManager {
  private app: App;
  private disabledTools: Set<string>;
  private settings: ObsidianMcpSettings;

  constructor(app: App, settings: ObsidianMcpSettings) {
    this.app = app;
    this.settings = settings;
    this.disabledTools = new Set(settings.disabledTools);
  }

  public isToolEnabled(name: string): boolean {
    return !this.disabledTools.has(name);
  }

  public setToolEnabled(name: string, enabled: boolean): void {
    if (enabled) {
      this.disabledTools.delete(name);
    } else {
      this.disabledTools.add(name);
    }
  }

  public getDisabledTools(): string[] {
    return Array.from(this.disabledTools);
  }

  public getAvailableTools(): string[] {
    const tools = [
      ...Object.keys(VAULT_TOOLS),
      ...Object.keys(VAULT_RESOURCES)
    ];

    // Only include get-schemas if dynamic tools are enabled
    if (!this.settings.enableDynamicTools) {
      return tools.filter(name => name !== 'get-schemas');
    }

    return tools;
  }

  public updateSettings(settings: ObsidianMcpSettings): void {
    this.settings = settings;
    this.disabledTools = new Set(settings.disabledTools);
  }

  public async registerTools(mcpServer: McpServer): Promise<void> {
    // Register individual vault tools
    for (const [toolName, registerFn] of Object.entries(VAULT_TOOLS)) {
      // Skip get-schemas if dynamic tools are disabled
      if (toolName === 'get-schemas' && !this.settings.enableDynamicTools) {
        continue;
      }

      if (!this.disabledTools.has(toolName)) {
        try {
          registerFn(this.app, mcpServer);
        } catch (error) {
          console.error(`Error registering tool ${toolName}:`, error);
        }
      }
    }

    // Register individual resources
    for (const [resourceName, registerFn] of Object.entries(VAULT_RESOURCES)) {
      if (!this.disabledTools.has(resourceName)) {
        try {
          registerFn(this.app, mcpServer);
        } catch (error) {
          console.error(`Error registering resource ${resourceName}:`, error);
        }
      }
    }

    // Register dynamic tools if enabled
    if (this.settings.enableDynamicTools) {
      await this.registerDynamicTools(mcpServer);
    }
  }

  private async registerDynamicTools(mcpServer: McpServer): Promise<void> {
    try {
      const schemas = await findAndParseSchemas(this.app, this.settings.dynamicToolsPath);
      
      for (const schema of schemas) {
        const toolName = `update-${schema.schemaName}`;
        
        // Skip if tool is disabled
        if (this.disabledTools.has(toolName)) {
          continue;
        }

        try {
          mcpServer.tool(
            toolName,
            schema.description || `Update tool for ${schema.schemaName}`,
            generateZodSchema(schema),
            (args) => handleGenericUpdate(this.app, schema, args)
          );
        } catch (error) {
          console.error(`Error registering dynamic tool ${toolName}:`, error);
        }
      }
    } catch (error) {
      console.error("Error registering dynamic tools:", error);
    }
  }
} 