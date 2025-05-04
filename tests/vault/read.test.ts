import { registerReadHandler } from "../../src/vault/read";
import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock the helpers module
jest.mock("../../src/utils/helpers", () => ({
  getSimilarFilesSuggestion: jest.fn(),
}));

// Mock Obsidian
jest.mock("obsidian", () => ({
  ...jest.requireActual("obsidian"),
  normalizePath: jest.fn((path) => path),
  App: jest.fn().mockImplementation(() => ({
    vault: {
      getAbstractFileByPath: jest.fn(),
      cachedRead: jest.fn(),
    },
  })),
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
    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
    const getSimilarFilesSuggestion =
      require("../../src/utils/helpers").getSimilarFilesSuggestion;
    getSimilarFilesSuggestion.mockReturnValue("");

    await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    expect(normalizePath).toHaveBeenCalledWith(testPath);
  });

  it("returns file content when file exists", async () => {
    const testPath = "test/path/file.md";
    const testContent = "test content";
    const mockFile = new TFile();

    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFile);
    (app.vault.cachedRead as jest.Mock).mockResolvedValue(testContent);

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    expect(result).toEqual({
      content: [{ type: "text", text: testContent }],
    });
  });

  it("suggests similar files when file not found", async () => {
    const testPath = "test/path/file.md";
    const suggestionString =
      "\n\nDid you mean:\n- test/path/files.md\n- test/path/other-file.md";
    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
    const getSimilarFilesSuggestion =
      require("../../src/utils/helpers").getSimilarFilesSuggestion;
    getSimilarFilesSuggestion.mockReturnValue(suggestionString);

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Did you mean:");
    expect(result.content[0].text).toContain("test/path/files.md");
    expect(result.content[0].text).toContain("test/path/other-file.md");
  });

  it("handles folder path appropriately", async () => {
    const testPath = "test/folder";
    const mockFolder = { path: testPath }; // Not a TFile instance

    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFolder);

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Path exists but is a folder");
  });

  it("handles read errors gracefully", async () => {
    const testPath = "test/path/file.md";
    const mockFile = new TFile();
    const errorMessage = "Failed to read file";

    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFile);
    (app.vault.cachedRead as jest.Mock).mockRejectedValue(
      new Error(errorMessage)
    );

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(errorMessage);
  });
});
