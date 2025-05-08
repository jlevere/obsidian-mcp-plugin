import { registerReadHandler } from "../../src/vault/read";
import { App, TFile } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Mock the helpers module
jest.mock("../../src/utils/helpers", () => ({
  getSimilarFilesSuggestion: jest.fn(),
  resolveTFileOrError: jest.fn(),
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

// Get references to the mocked helpers
import * as helpers from "../../src/utils/helpers";
const getSimilarFilesSuggestion =
  helpers.getSimilarFilesSuggestion as jest.Mock;
const resolveTFileOrError = helpers.resolveTFileOrError as jest.Mock;

describe("Vault Read Handler", () => {
  let app: App;
  let mcpServer: jest.Mocked<Pick<McpServer, "tool">>;
  let handlerFunction: ToolCallback<{ path: z.ZodString }>;
  let mockAbortSignal: AbortSignal;

  beforeEach(() => {
    jest.clearAllMocks();
    app = new App();
    mcpServer = { tool: jest.fn() };
    mockAbortSignal = new AbortController().signal;
    registerReadHandler(app, mcpServer as unknown as McpServer);
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

  it("returns file content when file exists", async () => {
    const testPath = "test/path/file.md";
    const testContent = "test content";
    const mockFile = new TFile();
    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFile);
    (app.vault.cachedRead as jest.Mock).mockResolvedValue(testContent);
    resolveTFileOrError.mockReturnValue({ file: mockFile, normPath: testPath });

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
    getSimilarFilesSuggestion.mockReturnValue(suggestionString);
    resolveTFileOrError.mockReturnValue({
      error: {
        content: [{ type: "text", text: suggestionString }],
        isError: true,
      },
    });

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    const errorResult = result.error as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(errorResult.isError).toBe(true);
    expect(errorResult.content[0].text).toContain("Did you mean:");
    expect(errorResult.content[0].text).toContain("test/path/files.md");
    expect(errorResult.content[0].text).toContain("test/path/other-file.md");
  });

  it("handles folder path appropriately", async () => {
    const testPath = "test/folder";
    const mockFolder = { path: testPath }; // Not a TFile instance
    (app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockFolder);
    resolveTFileOrError.mockReturnValue({
      error: {
        content: [
          { type: "text", text: `Path exists but is a folder: ${testPath}` },
        ],
        isError: true,
      },
    });

    const result = await handlerFunction(
      { path: testPath },
      {
        signal: mockAbortSignal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
      }
    );

    const errorResult = result.error as {
      isError: boolean;
      content: { text: string }[];
    };
    expect(errorResult.isError).toBe(true);
    expect(errorResult.content[0].text).toContain(
      "Path exists but is a folder"
    );
  });
});
