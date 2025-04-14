// tests/vault/read.test.ts
import { App, TFile } from "../../mocks/obsidian";
import { registerReadHandler } from "../../src/vault/read";

// Mock the MCP server module
jest.mock("@modelcontextprotocol/sdk/server/mcp.js", () => {
  return {
    McpServer: jest.fn().mockImplementation(() => ({
      tool: jest.fn(),
    })),
  };
});

describe("Vault Read Handler", () => {
  // Setup mocks
  let mockApp: App;
  let mockMcpServer: { tool: jest.Mock };
  let handlerFunction: Function;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mock app with required behavior
    mockApp = new App();
    mockMcpServer = { tool: jest.fn() };

    // Register the handler
    // This always generates linter erros, its okay, see mocks/obsidian.ts
    registerReadHandler(mockApp, mockMcpServer as any);

    // Extract the handler function for direct testing
    handlerFunction = mockMcpServer.tool.mock.calls[0][2];
  });

  it("registers the correct tool with the MCP server", () => {
    expect(mockMcpServer.tool).toHaveBeenCalledWith(
      "obsidian/vault/read",
      expect.objectContaining({
        path: expect.any(Object), // This represents the Zod schema
      }),
      expect.any(Function)
    );
  });

  it("returns file content when file exists", async () => {
    // Setup mock file
    const mockFile = new TFile();
    mockFile.path = "test-file.md";

    // Configure mock behavior
    mockApp.vault._getAbstractFileByPath = mockFile;
    mockApp.vault._read = "Test file content";

    // Call the handler directly
    const result = await handlerFunction({ path: "test-file.md" });

    // Verify results
    expect(result).toEqual({
      content: [{ type: "text", text: "Test file content" }],
    });
  });

  it("returns error when file is not found", async () => {
    // Configure mock behavior for file not found
    mockApp.vault._getAbstractFileByPath = null;

    // Call the handler directly
    const result = await handlerFunction({ path: "nonexistent.md" });

    // Verify error response
    expect(result).toEqual({
      content: [{ type: "text", text: "File not found: nonexistent.md" }],
      isError: true,
    });
  });

  it("handles exceptions during file reading", async () => {
    // Setup mock file
    const mockFile = new TFile();

    // Configure mock to throw exception
    mockApp.vault._getAbstractFileByPath = mockFile;
    mockApp.vault.read = jest
      .fn()
      .mockRejectedValue(new Error("Read operation failed"));

    // Call the handler directly
    const result = await handlerFunction({ path: "error-file.md" });

    // Verify error handling
    expect(result).toEqual({
      content: [
        { type: "text", text: "Error reading file: Read operation failed" },
      ],
      isError: true,
    });
  });

  it("correctly passes the file path to getAbstractFileByPath", async () => {
    // Spy on the getAbstractFileByPath method
    const spy = jest.spyOn(mockApp.vault, "getAbstractFileByPath");

    // Call handler
    await handlerFunction({ path: "specific/path/file.md" });

    // Verify correct path was used
    expect(spy).toHaveBeenCalledWith("specific/path/file.md");
  });
});
