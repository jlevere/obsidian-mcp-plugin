import { App, Plugin, PluginSettingTab, Setting, Notice } from "obsidian";
import express, { Request, Response } from "express";
import * as http from "http";

import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

export default class LocalRestApi extends Plugin {
  expressApp: express.Express;
  httpServer: http.Server;
  mcpTransport: SSEServerTransport | null = null;

  async onload() {
    console.log("LocalRestApi Plugin Loading...");
    this.setupExpressAndMcp();
    console.log("LocalRestApi Plugin Loaded.");
    this.app.workspace.trigger("obsidian-local-rest-api:loaded");
  }

  async onunload() {
    console.log("LocalRestApi Plugin Unloading...");
    if (this.httpServer) {
      this.httpServer.close();
      console.log("HTTP server closed.");
    }
    console.log("LocalRestApi Plugin Unloaded.");
  }

  async setupExpressAndMcp() {
    try {
      this.expressApp = express();
      this.httpServer = http.createServer(this.expressApp);

      const server = new McpServer({
        name: "Echo",
        version: "1.0.0",
      });

      server.resource(
        "echo",
        new ResourceTemplate("echo://{message}", { list: undefined }),
        async (uri, { message }) => {
          console.log(`Resource 'echo' called with message: ${message}`);
          return {
            contents: [
              {
                uri: uri.href,
                text: `Resource echo: ${message}`,
              },
            ],
          };
        }
      );

      server.tool("echo", { message: z.string() }, async ({ message }) => {
        console.log(`Tool 'echo' called with message: ${message}`);
        return {
          content: [{ type: "text", text: `Tool echo: ${message}` }],
        };
      });

      server.tool(":3", { message: z.string() }, async ({ message }) => {
        console.log(`Tool ':3' called with message: ${message}`);
        return {
          content: [{ type: "text", text: `:3` }],
        };
      });

      server.prompt("echo", { message: z.string() }, ({ message }) => {
        console.log(`Prompt 'echo' called with message: ${message}`);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please process this message: ${message}`,
              },
            },
          ],
        };
      });

      this.expressApp.get("/sse", (req: Request, res: Response) => {
        this.mcpTransport = new SSEServerTransport("/messages", res);
        server.connect(this.mcpTransport);
        console.log("SSE connection established.");
      });

      this.expressApp.post("/messages", (req: Request, res: Response) => {
        if (this.mcpTransport) {
          this.mcpTransport.handlePostMessage(req, res);
          console.log("POST message handled.");
        } else {
          res.status(400).send("No SSE connection established");
          console.error("Post message received before SSE connection.");
        }
      });

      const port = 3000;
      this.httpServer.listen(port, "0.0.0.0", () => {
        console.log(`McpServer listening on port ${port}`);
        new Notice(`McpServer started on port ${port}`);
      });
    } catch (error) {
      console.error("Error setting up Express and McpServer:", error);
      new Notice(`Error setting up Express and McpServer: ${error.message}`);
    }
  }
}
