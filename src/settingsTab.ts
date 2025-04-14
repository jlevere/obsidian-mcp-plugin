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

    new Setting(containerEl)
      .setName("Restart Server")
      .setDesc("Restart the MCP server to apply changes")
      .addButton((button) =>
        button.setButtonText("Restart Server").onClick(async () => {
          await this.plugin.restartServer();
        })
      );
  }
}
