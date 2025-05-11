import { App, PluginSettingTab, Setting, Notice, debounce } from "obsidian";
import ObsidianMcpPlugin from "./main";
import { VAULT_TOOLS, TOOL_DESCRIPTIONS } from "./vault/index";
import { VAULT_RESOURCES, RESOURCE_DESCRIPTIONS } from "./resources";
import { SessionInfo } from "./types";

export class ObsidianMcpSettingTab extends PluginSettingTab {
  plugin: ObsidianMcpPlugin;
  private debouncedSave: (value: string) => void;

  constructor(app: App, plugin: ObsidianMcpPlugin) {
    super(app, plugin);
    this.plugin = plugin;

    this.debouncedSave = debounce(
      async (value: string) => {
        this.plugin.settings.dynamicToolsPath = value;
        await this.plugin.saveSettings();
        this.plugin.toolManager.updateSettings(this.plugin.settings);
        new Notice(
          "Schema path changed. Please restart the server to apply changes."
        );
      },
      2000,
      true
    );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.serverControls(containerEl);
    this.displayActiveSessionsSection(containerEl);
    this.displayServerSettings(containerEl);
    this.displayToolsSection(containerEl);
    this.displayResourcesSection(containerEl);

    void this.displayDynamicToolsSettings(containerEl);
  }

  private serverControls(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName("Restart Server")
      .setDesc("Restart the MCP server to apply changes")
      .addButton((button) =>
        button
          .setButtonText("Restart Server")
          .setCta()
          .onClick(async () => {
            await this.plugin.restartServer();
            this.display();
          })
      );
  }

  private displayServerSettings(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("HTTP Server").setHeading();

    new Setting(containerEl)
      .setName("Server Port")
      .setDesc("Port for the MCP server")
      .addText((text) =>
        text
          .setPlaceholder("3000")
          .setValue(this.plugin.settings.port.toString())
          .onChange(async (value) => {
            if (value && !isNaN(Number(value))) {
              this.plugin.settings.port = Number(value);
              await this.plugin.saveSettings();
            } else if (value) {
              new Notice("Port must be a number");
            }
          })
      );

    new Setting(containerEl)
      .setName("Binding Host")
      .setDesc(
        "Host to bind the server to (0.0.0.0 for all interfaces, 127.0.0.1 for localhost only)"
      )
      .addText((text) =>
        text
          .setPlaceholder("0.0.0.0")
          .setValue(this.plugin.settings.bindingHost)
          .onChange(async (value) => {
            this.plugin.settings.bindingHost = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl).setName("Listening Endpoints").setHeading();

    const createEndpointSetting = (name: string, url: string) => {
      new Setting(containerEl)
        .setName(name)
        .addText(
          (text) =>
            (text.setValue(url).setDisabled(true).inputEl.style.width = "100%")
        )
        .addButton((button) =>
          button
            .setIcon("copy")
            .setTooltip("Copy URL")
            .onClick(async () => {
              await navigator.clipboard.writeText(url);
              new Notice(`${name} URL copied to clipboard!`);
            })
        );
    };

    const host = this.plugin.settings.bindingHost || "0.0.0.0";
    const port = this.plugin.settings.port || 3000;
    const mcpUrl = `http://${
      host === "0.0.0.0" ? "localhost" : host
    }:${port}/mcp`;
    const sseUrl = `http://${
      host === "0.0.0.0" ? "localhost" : host
    }:${port}/sse`;

    createEndpointSetting("Streamable HTTP", mcpUrl);
    createEndpointSetting("SSE", sseUrl);

    new Setting(containerEl).setName("Authentication").setHeading();
    new Setting(containerEl)
      .setName("Enable Authentication")
      .setDesc("Require bearer token for all API requests.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAuth)
          .onChange(async (value) => {
            this.plugin.settings.enableAuth = value;
            await this.plugin.saveSettings();
            new Notice(
              `Authentication ${
                value ? "enabled" : "disabled"
              }. Please restart the server to apply changes.`
            );
            this.display();
          })
      );

    if (this.plugin.settings.enableAuth) {
      // Masked token display
      const masked = this.plugin.settings.authToken.replace(/.(?=.{4})/g, "*");
      new Setting(containerEl)
        .setName("Auth Token")
        .setDesc(
          "Clients must send this token in the 'Authorization: Bearer <token>' HTTP header."
        )
        .addText((text) => text.setValue(masked).setDisabled(true))
        .addButton((button) =>
          button
            .setIcon("copy")
            .setTooltip("Copy Token")
            .onClick(async () => {
              await navigator.clipboard.writeText(
                this.plugin.settings.authToken
              );
              new Notice("Auth token copied to clipboard!");
            })
        )
        .addButton((button) =>
          button
            .setButtonText("Regenerate")
            .setTooltip("Generate a new token (clients will need to update)")
            .onClick(async () => {
              this.plugin.settings.authToken = crypto.randomUUID();
              await this.plugin.saveSettings();
              new Notice(
                "New auth token generated. Please restart the server."
              );
              this.display();
            })
        );
    }
  }

  private async displayDynamicToolsSettings(
    containerEl: HTMLElement
  ): Promise<void> {
    new Setting(containerEl).setName("Dynamic Tools").setHeading();

    new Setting(containerEl)
      .setName("Enable Dynamic Tools")
      .setDesc("Enable dynamic tool generation from schema files")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDynamicTools)
          .onChange(async (value) => {
            this.plugin.settings.enableDynamicTools = value;
            await this.plugin.saveSettings();
            new Notice(
              "Dynamic tools setting changed. Please restart the server to apply changes."
            );
          })
      );

    new Setting(containerEl)
      .setName("Schema Directory")
      .setDesc("Directory path for schema files (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("metadata/schemas")
          .setValue(this.plugin.settings.dynamicToolsPath)
          .onChange((value: string) => {
            this.debouncedSave(value);
          })
      );

    if (this.plugin.settings.enableDynamicTools) {
      const dynamicTools = await this.plugin.toolManager.getDynamicTools();
      if (dynamicTools.length > 0) {
        new Setting(containerEl).setName("Loaded Dynamic Tools").setHeading();
        const dynamicToolsContainer = containerEl.createDiv();
        dynamicToolsContainer.addClasses(["setting-item-description"]);
        dynamicToolsContainer.style.marginTop = "10px";
        dynamicToolsContainer.style.marginLeft = "10px";

        for (const toolName of dynamicTools) {
          this.createToggleSetting(
            dynamicToolsContainer,
            toolName,
            `Dynamic tool: ${toolName}`
          );
        }
      } else {
        const noToolsMsg = containerEl.createDiv();
        noToolsMsg.addClasses(["setting-item-description"]);
        noToolsMsg.style.marginTop = "10px";
        noToolsMsg.style.marginLeft = "10px";
        noToolsMsg.createSpan({
          text: "No dynamic tools found in the schema directory.",
        });
      }
    }
  }

  private createToggleSetting(
    containerEl: HTMLElement,
    name: string,
    description: string
  ) {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.toolManager.isToolEnabled(name))
          .onChange(async (value) => {
            this.plugin.toolManager.setToolEnabled(name, value);
            this.plugin.settings.disabledTools =
              this.plugin.toolManager.getDisabledTools();
            await this.plugin.saveSettings();
            new Notice(
              `Settings changed. Please restart the server to apply changes.`
            );
          })
      );
  }

  private displayToolsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Available Tools").setHeading();

    Object.keys(VAULT_TOOLS).forEach((toolName) => {
      const fullDescription =
        TOOL_DESCRIPTIONS[toolName] ?? "No description available";
      let shortDescription = fullDescription;
      if (shortDescription.length > 200) {
        shortDescription = shortDescription.slice(0, 200) + "...";
      }
      this.createToggleSetting(containerEl, toolName, shortDescription);
      const settingItems = containerEl.querySelectorAll(".setting-item");
      const lastSetting = settingItems[settingItems.length - 1] as
        | HTMLElement
        | undefined;
      if (lastSetting) {
        lastSetting.title = fullDescription;
      }
    });
  }

  private displayResourcesSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Available Resources").setHeading();

    Object.keys(VAULT_RESOURCES).forEach((resourceName) => {
      const fullDescription =
        RESOURCE_DESCRIPTIONS[resourceName] ?? "No description available";
      let shortDescription = fullDescription;
      if (shortDescription.length > 200) {
        shortDescription = shortDescription.slice(0, 200) + "...";
      }
      this.createToggleSetting(containerEl, resourceName, shortDescription);
      const settingItems = containerEl.querySelectorAll(".setting-item");
      const lastSetting = settingItems[settingItems.length - 1] as
        | HTMLElement
        | undefined;
      if (lastSetting) {
        lastSetting.title = fullDescription;
      }
    });
  }

  private displayActiveSessionsSection(containerEl: HTMLElement): void {
    new Setting(containerEl).setName("Active Sessions").setHeading();
    const serverManager = this.plugin.serverManager;
    const sessions: SessionInfo[] = serverManager.getSessionInfo();

    if (!sessions.length) {
      new Setting(containerEl)
        .setDesc("No active sessions.")
        .setClass("setting-item-description");
    } else {
      sessions.forEach((session: SessionInfo) => {
        new Setting(containerEl)
          .setName(`${session.type} - ${session.sessionId}`)
          .setDesc(session.connected ? "Connected" : "Disconnected")
          .setClass("setting-item-description");
      });
    }

    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Refresh Sessions").onClick(() => {
        this.display();
      })
    );
  }
}
