import { App, Plugin, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import * as http from "http";

import { registerVaultTools } from "./vault";
import { registerResources } from "./resources";
import { DEFAULT_SETTINGS, PLUGIN_NAME } from "./constants";
import { ObsidianMcpSettings } from "./utils/types";
import { ObsidianMcpSettingTab } from "./settingsTab";

export default class ObsidianMcpPlugin extends Plugin {
  settings: ObsidianMcpSettings;
  expressApp: express.Express;
  httpServer: http.Server;
  mcpServer: McpServer;
  mcpTransport: SSEServerTransport | null = null;
  registeredTools: string[] = [];
  registeredResources: string[] = [];
  registeredPrompts: string[] = [];

  async onload() {
    console.log(`${PLUGIN_NAME} Plugin Loading...`);

    await this.loadSettings();
    this.addSettingTab(new ObsidianMcpSettingTab(this.app, this));

    await this.setupExpressAndMcp();

    console.log(`${PLUGIN_NAME} Plugin Loaded.`);
    this.app.workspace.trigger("obsidian-mcp-plugin:loaded");
  }

  async onunload() {
    console.log(`${PLUGIN_NAME} Plugin Unloading...`);

    if (this.httpServer) {
      this.httpServer.close(() => {
        console.log("HTTP server closed.");
      });
    }

    console.log(`${PLUGIN_NAME} Plugin Unloaded.`);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async restartServer() {
    if (this.httpServer) {
      this.httpServer.close(async () => {
        console.log("HTTP server closed for restart.");
        await this.setupExpressAndMcp();
        new Notice(`${PLUGIN_NAME} server restarted.`);
      });
    } else {
      await this.setupExpressAndMcp();
      new Notice(`${PLUGIN_NAME} server started.`);
    }
  }

  async setupExpressAndMcp() {
    try {
      this.expressApp = express();
      this.httpServer = http.createServer(this.expressApp);

      this.mcpServer = new McpServer({
        name: PLUGIN_NAME,
        version: this.manifest.version,
      });

      registerVaultTools(this.app, this.mcpServer);
      this.registeredTools = this.getRegisteredToolNames();

      registerResources(this.app, this.mcpServer);
      this.registeredResources = this.getRegisteredResourceNames();

      this.expressApp.get(
        "/sse",
        (req: express.Request, res: express.Response) => {
          this.mcpTransport = new SSEServerTransport("/messages", res);
          this.mcpServer.connect(this.mcpTransport);
          console.log("SSE connection established.");
        }
      );

      this.expressApp.post(
        "/messages",
        (req: express.Request, res: express.Response) => {
          if (this.mcpTransport) {
            this.mcpTransport.handlePostMessage(req, res);
            console.log("POST message handled.");
          } else {
            res.status(400).send("No SSE connection established");
            console.error("Post message received before SSE connection.");
          }
        }
      );

      // Start the server
      const port = this.settings.port;
      const host = this.settings.bindingHost;

      this.httpServer.listen(port, host, () => {
        console.log(`${PLUGIN_NAME} server listening on ${host}:${port}`);
        new Notice(`${PLUGIN_NAME} server started on port ${port}`);
      });
    } catch (error) {
      console.error(
        `Error setting up Express and ${PLUGIN_NAME} server:`,
        error
      );
      new Notice(
        `Error setting up Express and ${PLUGIN_NAME} server: ${
          (error as Error).message
        }`
      );
    }
  }

  private getRegisteredToolNames(): string[] {
    return Object.keys(this.mcpServer["_registeredTools"] || {});
  }

  private getRegisteredResourceNames(): string[] {
    return Object.keys(this.mcpServer["_registeredResources"] || {});
  }
}
