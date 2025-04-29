import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import * as http from "http";
import { ServerConfig } from "../utils/types";
import { PLUGIN_NAME } from "../constants";

export class ServerManager {
  private expressApp: express.Express | null = null;
  private httpServer: http.Server | null = null;
  private mcpServer: McpServer | null = null;
  private mcpTransport: SSEServerTransport | null = null;
  private config: ServerConfig;
  private app: App;
  private version: string;
  private isShuttingDown = false;
  private onToolRegistration: (() => Promise<void>) | null = null;

  constructor(app: App, config: ServerConfig, version: string) {
    this.app = app;
    this.config = config;
    this.version = version;
  }

  public getMcpServer(): McpServer | null {
    return this.mcpServer;
  }

  public setToolRegistrationHandler(handler: () => Promise<void>): void {
    this.onToolRegistration = handler;
  }

  public async start(): Promise<void> {
    try {
      // Ensure clean state
      await this.stop();
      
      // Reset state
      this.isShuttingDown = false;
      this.expressApp = express();

      // Initialize server
      this.httpServer = http.createServer(this.expressApp);
      this.mcpServer = new McpServer({
        name: PLUGIN_NAME,
        version: this.version,
      });

      // Register tools before setting up routes
      if (this.onToolRegistration) {
        await this.onToolRegistration();
      }

      // Setup routes
      this.setupRoutes();

      // Start listening
      await this.listen();
    } catch (error) {
      console.error(`Error starting ${PLUGIN_NAME} server:`, error);
      new Notice(`Error starting ${PLUGIN_NAME} server: ${(error as Error).message}`);
      // Clean up on error
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      // Close SSE connection if exists
      if (this.mcpTransport) {
        try {
          const response = (this.mcpTransport as any).response;
          if (response?.end) {
            response.end();
          }
        } catch (e) {
          console.warn('Error closing SSE transport:', e);
        }
        this.mcpTransport = null;
      }

      if (this.mcpServer) {
        try {
          this.mcpServer.close();
        } catch (e) {
          console.warn('Error closing MCP server:', e);
        }
      }

      // Close HTTP server if exists
      if (this.httpServer) {
        await new Promise<void>((resolve) => {
          this.httpServer?.close(() => resolve());
          // Force close all connections
          setImmediate(() => {
            try {
              this.httpServer?.closeAllConnections();
            } catch (e) {
              console.warn('Error closing connections:', e);
            }
            resolve();
          });
        });
      }

      // Clear all references
      this.mcpServer = null;
      this.httpServer = null;
      this.expressApp = null;
      
      console.log("Server cleanup completed.");
    } catch (error) {
      console.error('Error during server cleanup:', error);
    } finally {
      this.isShuttingDown = false;
    }
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public updateConfig(newConfig: ServerConfig): void {
    this.config = newConfig;
  }

  private setupRoutes(): void {
    if (!this.expressApp) return;

    this.expressApp.get(
      "/sse",
      async (req: express.Request, res: express.Response) => {
        if (this.isShuttingDown) {
          res.status(503).send("Server is shutting down");
          return;
        }

        // Close existing SSE connection if any
        if (this.mcpTransport) {
          try {
            const response = (this.mcpTransport as any).response;
            if (response?.end) {
              response.end();
            }
          } catch (e) {
            console.warn('Error closing existing SSE transport:', e);
          }
          this.mcpTransport = null;
        }

        // Create new transport and connect
        this.mcpTransport = new SSEServerTransport("/messages", res);
        this.mcpServer?.connect(this.mcpTransport);
        console.log("SSE connection established.");

        // Handle client disconnect
        res.on('close', () => {
          if (this.mcpTransport) {
            this.mcpTransport = null;
            console.log("SSE connection closed by client.");
          }
        });
      }
    );

    this.expressApp.post(
      "/messages",
      (req: express.Request, res: express.Response) => {
        if (this.isShuttingDown) {
          res.status(503).send("Server is shutting down");
          return;
        }

        if (this.mcpTransport) {
          this.mcpTransport.handlePostMessage(req, res);
        } else {
          res.status(400).send("No SSE connection established");
          console.error("Post message received before SSE connection.");
        }
      }
    );
  }

  private async listen(): Promise<void> {
    if (!this.httpServer) throw new Error('Server not initialized');

    return new Promise((resolve, reject) => {
      const { port, bindingHost } = this.config;

      const onError = (error: Error & { code?: string }) => {
        if (error.code === 'EADDRINUSE') {
          console.error(`Port ${port} is already in use. Please try a different port.`);
          new Notice(`Port ${port} is already in use. Please try a different port.`);
        }
        reject(error);
      };

      this.httpServer?.once('error', onError);

      this.httpServer?.listen(port, bindingHost, () => {
        this.httpServer?.removeListener('error', onError);
        console.log(`${PLUGIN_NAME} server listening on ${bindingHost}:${port}`);
        resolve();
      });
    });
  }
} 