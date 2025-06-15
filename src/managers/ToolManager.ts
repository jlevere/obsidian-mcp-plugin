import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { VAULT_TOOLS } from "../vault/index";
import { VAULT_RESOURCES } from "../resources";
import { ObsidianMcpSettings } from "@types";
import { StructuredManager } from "./StructuredManager";

export class ToolManager {
  private app: App;
  private disabledTools: Set<string>;
  private settings: ObsidianMcpSettings;
  private structuredManager: StructuredManager;

  constructor(app: App, settings: ObsidianMcpSettings) {
    this.app = app;
    this.settings = settings;
    this.disabledTools = new Set(settings.disabledTools);
    this.structuredManager = new StructuredManager(app, {
      enabled: settings.enableDynamicTools,
      schemaDirectory: settings.dynamicToolsPath,
      disabledTools: this.disabledTools,
    });
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
    const tools = [...Object.keys(VAULT_TOOLS), ...Object.keys(VAULT_RESOURCES)];
    return tools;
  }

  public updateSettings(settings: ObsidianMcpSettings): void {
    this.settings = settings;
    this.disabledTools = new Set(settings.disabledTools);
    this.structuredManager = new StructuredManager(this.app, {
      enabled: settings.enableDynamicTools,
      schemaDirectory: settings.dynamicToolsPath,
      disabledTools: this.disabledTools,
    });
  }

  public async registerTools(mcpServer: McpServer): Promise<void> {
    // Register individual vault tools
    for (const [toolName, registerFn] of Object.entries(VAULT_TOOLS)) {
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

    // Register dynamic tools using StructuredManager if enabled
    if (this.settings.enableDynamicTools) {
      // Wait for a short delay to ensure vault is ready
      await new Promise(resolve => setTimeout(resolve, 1000));

      try {
        await this.structuredManager.registerTools(mcpServer);
      } catch (error) {
        console.error("Error registering dynamic tools:", error);
      }
    }
  }

  public async getDynamicTools(): Promise<string[]> {
    return await this.structuredManager.getDynamicTools();
  }
}
