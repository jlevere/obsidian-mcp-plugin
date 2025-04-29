import { App, Plugin, Notice } from "obsidian";
import { ObsidianMcpSettings } from "./utils/types";
import { DEFAULT_SETTINGS, PLUGIN_NAME } from "./constants";
import { ObsidianMcpSettingTab } from "./settingsTab";
import { ServerManager } from "./managers/ServerManager";
import { ToolManager } from "./managers/ToolManager";

export default class ObsidianMcpPlugin extends Plugin {
  settings: ObsidianMcpSettings;
  serverManager: ServerManager;
  toolManager: ToolManager;
  private isRestarting = false;

  async onload() {
    console.log(`${PLUGIN_NAME} Plugin Loading...`);

    await this.loadSettings();
    
    // Initialize managers
    this.toolManager = new ToolManager(this.app, this.settings);
    this.serverManager = new ServerManager(
      this.app,
      { port: this.settings.port, bindingHost: this.settings.bindingHost },
      this.manifest.version
    );

    // Set up tool registration handler
    this.serverManager.setToolRegistrationHandler(async () => {
      const mcpServer = this.serverManager.getMcpServer();
      if (mcpServer) {
        await this.toolManager.registerTools(mcpServer);
      }
    });

    // Add settings tab
    this.addSettingTab(new ObsidianMcpSettingTab(this.app, this));

    // Start server
    try {
      await this.serverManager.start();
    } catch (error) {
      console.error("Failed to start server:", error);
    }

    console.log(`${PLUGIN_NAME} Plugin Loaded.`);
    this.app.workspace.trigger("obsidian-mcp-plugin:loaded");
  }

  async onunload() {
    console.log(`${PLUGIN_NAME} Plugin Unloading...`);
    await this.serverManager.stop();
    console.log(`${PLUGIN_NAME} Plugin Unloaded.`);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async restartServer() {
    if (this.isRestarting) {
      console.log("Server restart already in progress");
      return;
    }

    try {
      this.isRestarting = true;
      
      // Update server config with current settings
      this.serverManager.updateConfig({
        port: this.settings.port,
        bindingHost: this.settings.bindingHost
      });

      // Restart server
      await this.serverManager.restart();
      
      // Tools will be registered by the SSE connection handler
      
      new Notice(`${PLUGIN_NAME} server restarted successfully.`);
    } catch (error) {
      console.error("Failed to restart server:", error);
      new Notice(`Failed to restart server: ${(error as Error).message}`);
    } finally {
      this.isRestarting = false;
    }
  }
}
