import { App, TFile, TFolder, TAbstractFile } from "obsidian";
import {
  McpServer,
  ResourceTemplate,
  ResourceMetadata,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFileMetadataObject } from "src/utils/helpers";

const resourceUri = "vault://map";
const resourceName = "Vault Map";
const resourceDescription =
  "Provides a hierarchical tree representation of the Obsidian vault, including file metadata.";

// Define the metadata for the resource
const metadata: ResourceMetadata = {
  mimeType: "application/json",
  description: resourceDescription,
};

export function registerVaultMapResource(app: App, mcpServer: McpServer) {
  mcpServer.resource(resourceName, resourceUri, metadata, async (uri) => {
    try {
      const root = app.vault.getRoot();

      async function buildTree(file: TAbstractFile, depth = 0): Promise<any> {
        if (file instanceof TFile) {
          const metadata = await getFileMetadataObject(app, file);
          return {
            name: file.name,
            type: "file",
            path: file.path,
            size: file.stat.size,
            modified: file.stat.mtime,
            tags: metadata.tags,
            frontmatter: metadata.frontmatter,
          };
        } else if (file instanceof TFolder) {
          const children = await Promise.all(
            file.children.map((child) => buildTree(child, depth + 1))
          );
          return {
            name: file.name,
            type: "folder",
            path: file.path,
            children,
          };
        }
        return null;
      }

      const tree = await buildTree(root);
      const content = JSON.stringify(tree, null, 2);

      return {
        contents: [
          {
            uri: uri.href,
            text: content,
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
