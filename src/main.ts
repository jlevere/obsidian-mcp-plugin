import { Plugin, Notice } from "obsidian";
import { ObsidianMcpSettings } from "@types";
import { DEFAULT_SETTINGS, PLUGIN_NAME } from "./constants";
import { ObsidianMcpSettingTab } from "./settingsTab";
import { ServerManager } from "./managers/ServerManager";
import { ToolManager } from "./managers/ToolManager";
import { getErrorMessage } from "./utils/helpers";

export default class ObsidianMcpPlugin extends Plugin {
  settings: ObsidianMcpSettings;
  toolManager: ToolManager;
  public serverManager: ServerManager;
  private isRestarting = false;
  private isInitialized = false;

  async onload() {
    await this.initializePlugin();
  }

  onunload() {
    void this.serverManager?.stop();
  }

  private async initializePlugin() {
    await this.loadSettings();
    this.initializeManagers();
    this.setupToolRegistration();
    this.addSettingTab(new ObsidianMcpSettingTab(this.app, this));

    // Defer server startup until Obsidian is ready
    this.app.workspace.onLayoutReady(async () => {
      await this.initializeServer();
    });
  }

  private initializeManagers() {
    this.toolManager = new ToolManager(this.app, this.settings);
    this.serverManager = new ServerManager(
      this.app,
      {
        port: this.settings.port,
        bindingHost: this.settings.bindingHost,
        enableAuth: this.settings.enableAuth,
        authToken: this.settings.authToken,
      },
      this.manifest.version,
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
    } catch (error) {
      new Notice(`Failed to initialize ${PLUGIN_NAME} server: ${getErrorMessage(error)}`);
    }
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      (await this.loadData()) as Partial<ObsidianMcpSettings>, // trust the data validates
    );

    if (!this.settings.authToken) {
      this.settings.authToken = crypto.randomUUID();
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async restartServer() {
    if (this.isRestarting) {
      return;
    }

    try {
      this.isRestarting = true;
      this.serverManager.updateConfig({
        port: this.settings.port,
        bindingHost: this.settings.bindingHost,
        enableAuth: this.settings.enableAuth,
        authToken: this.settings.authToken,
      });
      await this.serverManager.restart();
      new Notice(`${PLUGIN_NAME} server restarted successfully`);
    } catch (error) {
      const msg = getErrorMessage(error);
      console.error({ context: msg }, "Failed to restart server");
      new Notice(`Failed to restart server: ${msg}}`);
    } finally {
      this.isRestarting = false;
    }
  }

  getSettings(): ObsidianMcpSettings {
    return this.settings;
  }
}
