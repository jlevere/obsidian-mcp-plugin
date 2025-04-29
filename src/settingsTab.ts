import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import ObsidianMcpPlugin from "./main";

export class ObsidianMcpSettingTab extends PluginSettingTab {
  plugin: ObsidianMcpPlugin;

  constructor(app: App, plugin: ObsidianMcpPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Obsidian MCP Plugin Settings" });

    // Server Settings
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

    // Dynamic Tools Settings
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
            new Notice("Dynamic tools setting changed. Please restart the server to apply changes.");
          })
      );

    new Setting(containerEl)
      .setName("Schema Directory")
      .setDesc("Directory path for schema files (relative to vault root)")
      .addText((text) =>
        text
          .setPlaceholder("metadata/schemas")
          .setValue(this.plugin.settings.dynamicToolsPath)
          .onChange(async (value) => {
            this.plugin.settings.dynamicToolsPath = value;
            await this.plugin.saveSettings();
            new Notice("Schema path changed. Please restart the server to apply changes.");
          })
      );

    // Tool Settings
    containerEl.createEl("h3", { text: "Available Tools" });

    // Get available tools from the tool manager
    const availableTools = this.plugin.toolManager.getAvailableTools();

    // Display tools
    if (availableTools.length > 0) {
      for (const toolName of availableTools) {
        new Setting(containerEl)
          .setName(toolName)
          .setDesc(this.getToolDescription(toolName))
          .addToggle((toggle) =>
            toggle
              .setValue(this.plugin.toolManager.isToolEnabled(toolName))
              .onChange(async (value) => {
                this.plugin.toolManager.setToolEnabled(toolName, value);
                this.plugin.settings.disabledTools = this.plugin.toolManager.getDisabledTools();
                await this.plugin.saveSettings();
                new Notice("Tool settings changed. Please restart the server to apply changes.");
              })
          );
      }
    }

    new Setting(containerEl)
      .setName("Restart Server")
      .setDesc("Restart the MCP server to apply changes")
      .addButton((button) =>
        button.setButtonText("Restart Server").onClick(async () => {
          await this.plugin.restartServer();
        })
      );
  }

  private getToolDescription(toolName: string): string {
    // Add descriptions for known tools
    const descriptions: Record<string, string> = {
      'read-file': 'Read file contents from the vault',
      'diff-edit-file': 'Apply smart diffs to files',
      'fuzzy-search': 'Search for files using fuzzy matching',
      'vault-tree': 'Get hierarchical vault structure',
      'upsert-file': 'Create or update files',
      'get-schemas': 'Get available schema definitions',
      'vault-map': 'Get complete vault structure with metadata',
      'active-file': 'Get information about the currently active file'
    };

    return descriptions[toolName] || 'Tool for vault interaction';
  }
}
