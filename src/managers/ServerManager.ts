import { App, Notice } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { Request, Response, NextFunction } from "express";
import type { RequestHandler } from "express";
import * as http from "http";
import { randomUUID } from "crypto";
import { ServerConfig } from "@types";
import { PLUGIN_NAME } from "../constants";
import { timingSafeEqual } from "crypto";

/**
 * Manages the MCP server instance and its transports.
 * Supports both StreamableHTTP (2025-03-26) and SSE (2024-11-05) protocols.
 */
export class ServerManager {
  private readonly KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
  private readonly DEFAULT_HEADERS = {
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  private expressApp: express.Express | null = null;
  private httpServer: http.Server | null = null;
  private mcpServer: McpServer | null = null;
  private mcpTransports: Map<
    string,
    SSEServerTransport | StreamableHTTPServerTransport
  > = new Map();
  private isShuttingDown = false;
  private onToolRegistration: (() => Promise<void>) | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly app: App,
    private config: ServerConfig,
    private readonly version: string
  ) {}

  /**
   * Gets the current MCP server instance.
   * @returns The MCP server instance or null if not initialized
   */
  public getMcpServer(): McpServer | null {
    return this.mcpServer;
  }

  /**
   * Sets a handler to be called when tools need to be registered with the server.
   * This is typically called when a new transport connects.
   * @param handler - The handler function to register tools
   */
  public setToolRegistrationHandler(handler: () => Promise<void>): void {
    this.onToolRegistration = handler;
  }

  /**
   * Updates the server configuration.
   * Note: Changes only take effect after server restart.
   * @param newConfig - The new server configuration
   */
  public updateConfig(newConfig: ServerConfig): void {
    this.config = newConfig;
  }

  /**
   * Starts the MCP server and initializes all transports.
   * @throws Error if server initialization fails
   */
  public async start(): Promise<void> {
    try {
      // Ensure clean state
      await this.stop();

      // Reset state
      this.isShuttingDown = false;
      this.expressApp = express();
      this.expressApp.use(express.json());

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

      // Bearer auth middleware
      this.expressApp.use(
        bearerAuth(
          () => (this.config.enableAuth ? this.config.authToken : null),
          PLUGIN_NAME
        )
      );

      // Setup routes
      this.setupRoutes();

      // Start listening
      await this.listen();
    } catch (error) {
      console.error(`Error starting ${PLUGIN_NAME} server:`, error);
      new Notice(
        `Error starting ${PLUGIN_NAME} server: ${(error as Error).message}`
      );
      // Clean up on error
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the server and cleans up all resources.
   * Safe to call multiple times.
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      await this.cleanupResources();
    } catch (error) {
      console.error("Error during server cleanup:", error);
    } finally {
      this.isShuttingDown = false;
    }
  }

  /**
   * Restarts the server with current configuration.
   */
  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Sets up the HTTP routes for both StreamableHTTP and SSE protocols.
   */
  private setupRoutes(): void {
    if (!this.expressApp) return;

    this.setupStreamableHttpEndpoint();
    this.setupSseEndpoint();
    this.setupLegacyMessageEndpoint();
  }

  /**
   * Sets up the StreamableHTTP endpoint that handles all HTTP methods.
   */
  private setupStreamableHttpEndpoint(): void {
    this.expressApp?.all(
      "/mcp",
      async (req: express.Request, res: express.Response) => {
        if (this.isShuttingDown) {
          res.status(503).send("Server is shutting down");
          return;
        }

        // Set headers for long-lived connections
        Object.entries(this.DEFAULT_HEADERS).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        try {
          const transport = await this.resolveStreamableTransport(req, res);
          if (!transport) return;

          // Handle the request with the transport
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          this.handleTransportError(error, res);
        }
      }
    );
  }

  /**
   * Helper method to resolve the appropriate StreamableHTTP transport.
   * Returns null if no valid transport could be resolved.
   */
  private async resolveStreamableTransport(
    req: express.Request,
    res: express.Response
  ): Promise<StreamableHTTPServerTransport | null> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Case 1: Existing session
    if (sessionId && this.mcpTransports.has(sessionId)) {
      return this.getExistingTransport(sessionId, res);
    }

    // Case 2: New initialization request
    if (
      !sessionId &&
      req.method === "POST" &&
      req.body?.method === "initialize"
    ) {
      return this.createNewStreamableTransport();
    }

    // Case 3: Invalid request
    this.sendInvalidSessionResponse(res);
    return null;
  }

  /**
   * Sets up the SSE endpoint for legacy clients.
   */
  private setupSseEndpoint(): void {
    this.expressApp?.get(
      "/sse",
      async (req: express.Request, res: express.Response) => {
        if (this.isShuttingDown) {
          res.status(503).send("Server is shutting down");
          return;
        }

        await this.setupSseConnection(req, res);
      }
    );
  }

  /**
   * Sets up a new SSE connection with proper headers and event handlers.
   */
  private async setupSseConnection(
    req: express.Request,
    res: express.Response
  ): Promise<void> {
    // Set headers for SSE
    Object.entries(this.DEFAULT_HEADERS).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    res.setHeader("Content-Type", "text/event-stream");

    // Configure socket for long-lived connection
    this.configureSseSocket(req.socket);

    const transport = new SSEServerTransport("/messages", res);
    this.mcpTransports.set(transport.sessionId, transport);

    // Set up keep-alive and cleanup handlers
    const keepAliveTimer = this.setupSseKeepAlive(res);
    this.setupSseCleanup(res, transport, keepAliveTimer);

    await this.mcpServer?.connect(transport);
  }

  /**
   * Sets up cleanup handlers for SSE connection.
   */
  private setupSseCleanup(
    res: express.Response,
    transport: SSEServerTransport,
    keepAliveTimer: NodeJS.Timeout
  ): void {
    res.on("close", () => {
      clearInterval(keepAliveTimer);
      this.mcpTransports.delete(transport.sessionId);
    });
  }

  /**
   * Sets up the legacy message endpoint for SSE clients.
   */
  private setupLegacyMessageEndpoint(): void {
    this.expressApp?.post(
      "/messages",
      async (req: express.Request, res: express.Response) => {
        if (this.isShuttingDown) {
          res.status(503).send("Server is shutting down");
          return;
        }

        const transport = this.resolveSseTransport(req, res);
        if (!transport) return;

        await transport.handlePostMessage(req, res, req.body);
      }
    );
  }

  /**
   * Helper method to resolve and validate SSE transport for legacy messages.
   * Returns null if no valid transport could be resolved.
   */
  private resolveSseTransport(
    req: express.Request,
    res: express.Response
  ): SSEServerTransport | null {
    const sessionId = req.query.sessionId as string;
    const transport = this.mcpTransports.get(sessionId);

    if (!transport || !(transport instanceof SSEServerTransport)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: No valid SSE transport found for session",
        },
        id: null,
      });
      return null;
    }

    return transport;
  }

  /**
   * Starts the HTTP server and begins listening for connections.
   */
  private async listen(): Promise<void> {
    if (!this.httpServer) throw new Error("Server not initialized");

    return new Promise((resolve, reject) => {
      const { port, bindingHost } = this.config;

      const onError = (error: Error & { code?: string }) => {
        if (error.code === "EADDRINUSE") {
          const message = `Port ${port} is already in use. Please try a different port.`;
          console.error(message);
          new Notice(message);
        }
        reject(error);
      };

      this.httpServer?.once("error", onError);

      this.httpServer?.listen(port, bindingHost, () => {
        this.httpServer?.removeListener("error", onError);
        console.log(
          `${PLUGIN_NAME} express server listening on ${bindingHost}:${port}`
        );
        resolve();
      });
    });
  }

  /**
   * Helper method to get an existing transport by session ID.
   */
  private async getExistingTransport(
    sessionId: string,
    res: express.Response
  ): Promise<StreamableHTTPServerTransport | null> {
    const existingTransport = this.mcpTransports.get(sessionId);
    if (existingTransport instanceof StreamableHTTPServerTransport) {
      return existingTransport;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message:
          "Bad Request: Session exists but uses a different transport protocol",
      },
      id: null,
    });
    return null;
  }

  /**
   * Helper method to create a new StreamableHTTP transport.
   */
  private async createNewStreamableTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => {
        this.mcpTransports.set(sid, transport);
      },
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && this.mcpTransports.has(sid)) {
        this.mcpTransports.delete(sid);
      }
    };

    await this.mcpServer?.connect(transport);
    return transport;
  }

  /**
   * Helper method to configure SSE socket parameters.
   */
  private configureSseSocket(socket: any): void {
    socket.setTimeout(0);
    socket.setNoDelay(true);
    socket.setKeepAlive(true);
  }

  /**
   * Helper method to set up SSE keep-alive messages.
   */
  private setupSseKeepAlive(res: express.Response): NodeJS.Timeout {
    return setInterval(() => {
      if (!res.closed) {
        res.write(": keep-alive\n\n");
      }
    }, this.KEEP_ALIVE_INTERVAL);
  }

  /**
   * Helper method to send invalid session response.
   */
  private sendInvalidSessionResponse(res: express.Response): void {
    res.status(400).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Bad Request: No valid session ID provided",
      },
      id: null,
    });
  }

  /**
   * Helper method to handle transport errors.
   */
  private handleTransportError(error: any, res: express.Response): void {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }

  /**
   * Helper method to clean up all resources.
   */
  private async cleanupResources(): Promise<void> {
    await Promise.all([
      this.clearKeepAlive(),
      this.closeTransports(),
      this.closeServers(),
    ]);

    // Clear all references
    this.mcpServer = null;
    this.httpServer = null;
    this.expressApp = null;
  }

  /**
   * Clears the keep-alive interval.
   */
  private async clearKeepAlive(): Promise<void> {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Closes all active transports.
   */
  private async closeTransports(): Promise<void> {
    const closePromises = Array.from(this.mcpTransports.entries()).map(
      async ([sessionId, transport]) => {
        try {
          await transport.close();
        } catch (e) {
          console.warn(`Error closing transport ${sessionId}:`, e);
        }
      }
    );

    await Promise.all(closePromises);
    this.mcpTransports.clear();
  }

  /**
   * Closes the MCP and HTTP servers.
   */
  private async closeServers(): Promise<void> {
    // Close MCP server
    if (this.mcpServer) {
      try {
        this.mcpServer.close();
      } catch (e) {
        console.warn("Error closing MCP server:", e);
      }
    }

    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
        // Force close all connections
        setImmediate(() => {
          try {
            this.httpServer?.closeAllConnections();
          } catch (e) {
            console.warn("Error closing connections:", e);
          }
          resolve();
        });
      });
    }
  }
}

export function bearerAuth(
  getToken: () => string | null | undefined,
  realm = "MCP"
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = getToken();

      if (token == null) {
        return next();
      }

      const authHeader = req.header("Authorization") || "";

      const [scheme, credentials] = authHeader.split(/\s+/, 2);

      if (scheme?.toLowerCase() !== "bearer" || !credentials) {
        res
          .status(401)
          .header("WWW-Authenticate", `Bearer realm="${realm}"`)
          .json({
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message: "Forbidden: invalid bearer token.",
            },
            id: null,
          });
        return;
      }

      const expected = Buffer.from(token, "utf8");
      const actual = Buffer.from(credentials.trim(), "utf8");

      let areEqual = false;
      if (expected.length === actual.length) {
        areEqual = timingSafeEqual(expected, actual);
      }

      if (!areEqual) {
        res
          .status(403)
          .header("WWW-Authenticate", `Bearer realm="${realm}"`)
          .json({
            jsonrpc: "2.0",
            error: {
              code: -32002,
              message: "Forbidden: invalid bearer token.",
            },
            id: null,
          });
        return;
      }
      next();
    } catch (error) {
      console.error("[Auth] CRITICAL ERROR in auth middleware:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Internal Server Error during authentication",
          },
          id: null,
        });
      }
      return;
    }
  };
}
