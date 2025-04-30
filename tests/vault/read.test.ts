import { registerReadHandler } from "../../src/vault/read";
import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findSimilarFiles } from "../../src/utils/helpers";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock the helpers module
jest.mock("../../src/utils/helpers", () => ({
  findSimilarFiles: jest.fn(),
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
    (findSimilarFiles as jest.Mock).mockReturnValue([]);

    await handlerFunction({ path: testPath }, { signal: mockAbortSignal });

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
      { signal: mockAbortSignal }
    );

    expect(result).toEqual({
      content: [{ type: "text", text: testContent }],
    });
  });

  it("suggests similar files when file not found", async () => {
    const testPath = "test/path/file.md";
    const similarFiles = [
      { path: "test/path/files.md", score: 0.8 },
      { path: "test/path/other-file.md", score: 0.6 },
    ];

    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
    (findSimilarFiles as jest.Mock).mockReturnValue(similarFiles);

    const result = await handlerFunction(
      { path: testPath },
      { signal: mockAbortSignal }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Did you mean:");
    expect(result.content[0].text).toContain(similarFiles[0].path);
    expect(result.content[0].text).toContain(similarFiles[1].path);
  });

  it("handles folder path appropriately", async () => {
    const testPath = "test/folder";
    const mockFolder = { path: testPath }; // Not a TFile instance

    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFolder);

    const result = await handlerFunction(
      { path: testPath },
      { signal: mockAbortSignal }
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
      { signal: mockAbortSignal }
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(errorMessage);
  });
});
