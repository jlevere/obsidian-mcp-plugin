import { registerReadHandler } from "../../src/vault/read";
import { App, TFile, Vault, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as obsidianCrudUtils from "../../src/utils/obsidian-crud-utils";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define the response type based on MCP protocol
type CallToolResult = {
  content: Array<{
    type: "text" | "image" | "audio" | "video";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

// Mock MCP SDK
jest.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: jest.fn().mockImplementation(() => ({
    tool: jest.fn(),
  })),
}));

// Mock Obsidian
jest.mock("obsidian", () => ({
  ...jest.requireActual("obsidian"),
  normalizePath: jest.fn((path) => path),
  App: jest.fn().mockImplementation(() => ({
    vault: {
      read: jest.fn(),
    },
  })),
}));

// Mock the crud utils
jest.mock("../../src/utils/obsidian-crud-utils", () => ({
  findFileCaseInsensitive: jest.fn(),
}));

describe("Vault Read Handler", () => {
  let app: App;
  let mcpServer: jest.Mocked<Pick<McpServer, "tool">>;
  let handlerFunction: ToolCallback<{ path: z.ZodString }>;
  let mockAbortSignal: AbortSignal;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh instances
    app = new App();
    mcpServer = { tool: jest.fn() };

    // Create mock abort signal
    mockAbortSignal = new AbortController().signal;

    // Register the handler
    registerReadHandler(app, mcpServer as unknown as McpServer);

    // Get the handler function from the registration
    handlerFunction = mcpServer.tool.mock.calls[0][3];
  });

  it("registers with the correct name and schema", () => {
    expect(mcpServer.tool).toHaveBeenCalledWith(
      "read-file",
      expect.any(String),
      expect.objectContaining({
        path: expect.any(Object), // Zod schema object
      }),
      expect.any(Function)
    );
  });

  it("normalizes the file path", async () => {
    const testPath = "test/path/file.md";

    // Set up mocks
    (obsidianCrudUtils.findFileCaseInsensitive as jest.Mock).mockReturnValue(
      null
    );

    await handlerFunction({ path: testPath }, { signal: mockAbortSignal });

    expect(normalizePath).toHaveBeenCalledWith(testPath);
  });
});
