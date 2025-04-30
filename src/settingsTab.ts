import { App, PluginSettingTab, Setting, Notice, debounce } from "obsidian";
import ObsidianMcpPlugin from "./main";
import { VAULT_TOOLS, TOOL_DESCRIPTIONS } from "./vault/index";
import { VAULT_RESOURCES, RESOURCE_DESCRIPTIONS } from "./resources";

export class ObsidianMcpSettingTab extends PluginSettingTab {
  plugin: ObsidianMcpPlugin;
  private debouncedSave: (value: string) => void;

  constructor(app: App, plugin: ObsidianMcpPlugin) {
    super(app, plugin);
    this.plugin = plugin;

    // Create debounced save function that waits 2 seconds after last change
    this.debouncedSave = debounce(
      async (value: string) => {
        this.plugin.settings.dynamicToolsPath = value;
        await this.plugin.saveSettings();
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

    containerEl.createEl("h2", { text: "Obsidian MCP Plugin Settings" });

    // Server Settings
    this.displayServerSettings(containerEl);

    // Tools and Resources Sections
    this.displayToolsSection(containerEl);
    this.displayResourcesSection(containerEl);

    // Dynamic Tools Settings
    this.displayDynamicToolsSettings(containerEl);

    // Restart Server Button
    new Setting(containerEl)
      .setName("Restart Server")
      .setDesc("Restart the MCP server to apply changes")
      .addButton((button) =>
        button.setButtonText("Restart Server").onClick(async () => {
          await this.plugin.restartServer();
        })
      );
  }

  private displayServerSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Server Settings" });

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
  }

  private displayDynamicToolsSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Dynamic Tools" });

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
    const toolsContainer = containerEl.createDiv();
    toolsContainer.createEl("h3", { text: "Available Tools" });

    Object.keys(VAULT_TOOLS).forEach((toolName) => {
      const description =
        TOOL_DESCRIPTIONS[toolName] ?? "No description available";
      this.createToggleSetting(toolsContainer, toolName, description);
    });
  }

  private displayResourcesSection(containerEl: HTMLElement): void {
    const resourcesContainer = containerEl.createDiv();
    resourcesContainer.createEl("h3", { text: "Available Resources" });

    Object.keys(VAULT_RESOURCES).forEach((resourceName) => {
      const description =
        RESOURCE_DESCRIPTIONS[resourceName] ?? "No description available";
      this.createToggleSetting(resourcesContainer, resourceName, description);
    });
  }
}
