import { App, Plugin, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import * as http from "http";
import * as fs from 'fs';
import { z } from "zod";

import { registerVaultTools } from "./vault";
import { registerResources } from "./resources";
import { DEFAULT_SETTINGS, PLUGIN_NAME } from "./constants";
import { ObsidianMcpSettings } from "./utils/types";
import { ObsidianMcpSettingTab } from "./settingsTab";

import { SchemaDefinition, findAndParseSchemas } from "./schema-manager";
import { generateZodSchema, handleGenericUpdate as handleGenericUpdateFunc } from "./dynamic-tool-handler";

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

    // Setup Express and initialize MCP server (but don't register dynamic tools yet)
    await this.setupExpressAndMcpCore();

    // Defer dynamic tool registration until layout is ready
    this.app.workspace.on('layout-ready' as any, async () => {
      console.log("Layout ready, attempting to register dynamic tools...");
      // Check if mcpServer is initialized before proceeding
      if (!this.mcpServer) {
        console.error("MCP Server not ready when layout-ready fired.");
        return;
      }
      await this.registerDynamicTools();
      // Update the list after dynamic tools are registered
      this.registeredTools = this.getRegisteredToolNames();
      console.log("Updated Registered Tools:", this.registeredTools);
    });

    console.log(`${PLUGIN_NAME} Plugin Loaded. Waiting for layout-ready to register dynamic tools.`);
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
        // Re-setup core and re-register dynamic tools
        await this.setupExpressAndMcpCore();
        await this.registerDynamicTools(); // Register dynamic tools again
        // Update the list after dynamic tools are registered
        this.registeredTools = this.getRegisteredToolNames();
        console.log("Updated Registered Tools after restart:", this.registeredTools);
        new Notice(`${PLUGIN_NAME} server restarted.`);
      });
    } else {
      await this.setupExpressAndMcpCore();
      await this.registerDynamicTools(); // Register dynamic tools
      // Update the list after dynamic tools are registered
      this.registeredTools = this.getRegisteredToolNames();
      console.log("Updated Registered Tools after start:", this.registeredTools);
      new Notice(`${PLUGIN_NAME} server started.`);
    }
  }

  // Renamed: Sets up server instance, static tools, resources, routes
  async setupExpressAndMcpCore() {
    try {
      this.expressApp = express();
      this.httpServer = http.createServer(this.expressApp);

      // Initialize MCP Server
      this.mcpServer = new McpServer({
        name: PLUGIN_NAME,
        version: this.manifest.version,
      });

      // Register Static Tools
      registerVaultTools(this.app, this.mcpServer);
      console.log("Registered static vault tools.");

      // Register Resources
      registerResources(this.app, this.mcpServer);
      this.registeredResources = this.getRegisteredResourceNames();
      console.log("Registered Resources:", this.registeredResources);

      // Setup Routes (remain the same)
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

      // Start listening (remain the same)
      const port = this.settings.port;
      const host = this.settings.bindingHost;
      this.httpServer.listen(port, host, () => {
        console.log(`${PLUGIN_NAME} server listening on ${host}:${port}`);
        // Notice might be slightly premature now, consider moving after dynamic tools load?
        // new Notice(`${PLUGIN_NAME} server started on port ${port}`);
      });

    } catch (error) {
      // Error handling remains the same
      console.error(
        `Error setting up Express and ${PLUGIN_NAME} server:`,
        error
      );
      new Notice(
        `Error setting up Express and ${PLUGIN_NAME} server: ${(error as Error).message
        }`
      );
    }
  }


  // New function to handle dynamic tool registration
  async registerDynamicTools() {
    if (!this.mcpServer) {
      console.error("MCP Server not initialized. Cannot register dynamic tools.");
      return;
    }
    console.log("Registering dynamic tools from schemas...");
    try {
      const schemas: SchemaDefinition[] = await findAndParseSchemas(this.app);
      console.log(`Found ${schemas.length} valid schemas to register.`);

      for (const schema of schemas) {
        try {
          const toolName = `update-${schema.schemaName}`;
          // Check if tool already exists (e.g., from static registration or previous dynamic load)
          if ((this.mcpServer as any)["_registeredTools"][toolName]) {
            console.warn(`Tool '${toolName}' already registered. Skipping dynamic registration for this schema.`);
            continue;
          }
          console.log(`Registering dynamic tool: ${toolName}`);
          const zodSchema: z.ZodRawShape = generateZodSchema(schema);

          this.mcpServer.tool(
            toolName,
            schema.description,
            zodSchema,
            (args) => this.dynamicToolHandlerWrapper(schema, args)
          );
          console.log(`Successfully registered dynamic tool: ${toolName}`);
        } catch (toolRegError) {
          console.error(`Error registering dynamic tool for schema '${schema.schemaName}':`, toolRegError);
        }
      }
      // Potentially show notice once dynamic tools are done loading
      if (schemas.length > 0) {
        new Notice(`Loaded ${schemas.length} dynamic tool(s).`);
      }

    } catch (schemaLoadError) {
      console.error("Error loading or parsing schemas for dynamic tools:", schemaLoadError);
      new Notice(`Error loading dynamic tools: ${(schemaLoadError as Error).message}`);
    }
    console.log("Finished registering dynamic tools.");
  }


  // dynamicToolHandlerWrapper remains the same
  private async dynamicToolHandlerWrapper(definition: SchemaDefinition, inputArgs: Record<string, any>) {
    console.log(`Executing dynamic tool: update-${definition.schemaName}`); // Corrected log message prefix
    return handleGenericUpdateFunc(this.app, definition, inputArgs);
  }

  // getRegisteredToolNames/ResourceNames remain the same
  private getRegisteredToolNames(): string[] {
    // Accessing private property - ensure this works or use a public getter if available
    return Object.keys((this.mcpServer as any)["_registeredTools"] || {});
  }

  private getRegisteredResourceNames(): string[] {
    // Accessing private property - ensure this works or use a public getter if available
    return Object.keys((this.mcpServer as any)["_registeredResources"] || {});
  }
}
