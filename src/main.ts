import { App, Plugin, Notice } from "obsidian";
import { ObsidianMcpSettings } from "./types";
import { DEFAULT_SETTINGS, PLUGIN_NAME } from "./constants";
import { ObsidianMcpSettingTab } from "./settingsTab";
import { ServerManager } from "./managers/ServerManager";
import { ToolManager } from "./managers/ToolManager";

export default class ObsidianMcpPlugin extends Plugin {
  settings: ObsidianMcpSettings;
  toolManager: ToolManager;
  private serverManager: ServerManager;
  private isRestarting = false;
  private isInitialized = false;

  async onload() {
    console.log(`${PLUGIN_NAME} loading...`);
    await this.initializePlugin();
  }

  async onunload() {
    console.log(`${PLUGIN_NAME} unloading...`);
    await this.serverManager?.stop();
    console.log(`${PLUGIN_NAME} unloaded`);
  }

  private async initializePlugin() {
    await this.loadSettings();
    this.initializeManagers();
    this.setupToolRegistration();
    this.addSettingTab(new ObsidianMcpSettingTab(this.app, this));

    // Defer server startup until Obsidian is ready
    this.app.workspace.onLayoutReady(() => {
      this.initializeServer();
    });

    console.log(`${PLUGIN_NAME} loaded (server initialization deferred)`);
  }

  private initializeManagers() {
    this.toolManager = new ToolManager(this.app, this.settings);
    this.serverManager = new ServerManager(
      this.app,
      {
        port: this.settings.port,
        bindingHost: this.settings.bindingHost,
      },
      this.manifest.version
    );
  }

  private setupToolRegistration() {
    this.serverManager.setToolRegistrationHandler(async () => {
      const mcpServer = this.serverManager.getMcpServer();
      if (mcpServer) {
        await this.toolManager.registerTools(mcpServer);
      }
    });
  }

  private async initializeServer() {
    if (this.isInitialized) return;

    try {
      await this.serverManager.start();
      this.isInitialized = true;
      console.log(`${PLUGIN_NAME} server initialized`);
    } catch (error) {
      console.error("Failed to initialize server:", error);
      new Notice(
        `Failed to initialize ${PLUGIN_NAME} server: ${
          (error as Error).message
        }`
      );
    }
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
      this.serverManager.updateConfig({
        port: this.settings.port,
        bindingHost: this.settings.bindingHost,
      });
      await this.serverManager.restart();
      new Notice(`${PLUGIN_NAME} server restarted successfully`);
    } catch (error) {
      console.error("Failed to restart server:", error);
      new Notice(`Failed to restart server: ${(error as Error).message}`);
    } finally {
      this.isRestarting = false;
    }
  }

  getSettings(): ObsidianMcpSettings {
    return this.settings;
  }
}
