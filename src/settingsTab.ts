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

  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "MCP" });

    // Server Settings
    this.displayServerSettings(containerEl);

    // Tools and Resources Sections
    this.displayToolsSection(containerEl);
    this.displayResourcesSection(containerEl);

    // Dynamic Tools Settings
    await this.displayDynamicToolsSettings(containerEl);

    // Restart Server Button
    new Setting(containerEl)
      .setName("Restart Server")
      .setDesc("Restart the MCP server to apply changes")
      .addButton((button) =>
        button.setButtonText("Restart Server").onClick(async () => {
          await this.plugin.restartServer();
          await this.display();
        })
      );
  }

  private displayServerSettings(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "HTTP Server" });

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

    containerEl.createEl("h4", {
      text: "Listening Endpoints",
      cls: "setting-item-name",
    });

    const host = this.plugin.settings.bindingHost || "0.0.0.0";
    const port = this.plugin.settings.port || 3000;
    const mcpUrl = `http://${host}:${port}/mcp`;
    const sseUrl = `http://${host}:${port}/sse`;

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
            .onClick(() => {
              navigator.clipboard.writeText(url);
              new Notice(`${name} URL copied to clipboard!`);
            })
        );
    };

    createEndpointSetting("Streamable HTTP", mcpUrl);
    createEndpointSetting("SSE", sseUrl);
  }

  private async displayDynamicToolsSettings(
    containerEl: HTMLElement
  ): Promise<void> {
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

    if (this.plugin.settings.enableDynamicTools) {
      const dynamicTools = await this.plugin.toolManager.getDynamicTools();
      if (dynamicTools.length > 0) {
        containerEl.createEl("h4", { text: "Loaded Dynamic Tools" });
        const dynamicToolsContainer = containerEl.createDiv();
        dynamicToolsContainer.addClasses(["setting-item-description"]);
        dynamicToolsContainer.style.marginTop = "10px";
        dynamicToolsContainer.style.marginLeft = "10px";

        console.log(dynamicTools);

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
