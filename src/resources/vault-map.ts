import { App } from "obsidian";
import {
  McpServer,
  ResourceTemplate,
  ResourceMetadata,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { buildVaultTree } from "../utils/helpers";

const resourceUri = "vault://map";
const resourceName = "Vault Map";
const resourceDescription =
  "Provides a hierarchical tree representation of the Obsidian vault, including file metadata.";

// Define the metadata for the resource
export const metadata: ResourceMetadata = {
  mimeType: "application/json",
  description: resourceDescription,
};

export function registerVaultMapResource(app: App, mcpServer: McpServer) {
  mcpServer.resource(resourceName, resourceUri, metadata, async (uri) => {
    try {
      const root = app.vault.getRoot();
      const tree = await buildVaultTree(app, root, { includeMetadata: true });

      if (!tree) {
        throw new Error("Failed to build vault tree");
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(tree, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        contents: [
          {
            uri: uri.href,
            text: `Error building vault map: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  });
}
