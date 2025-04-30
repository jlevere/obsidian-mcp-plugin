import { App } from "obsidian";
import {
  McpServer,
  ResourceMetadata,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFileMetadataObject } from "../utils/helpers";

const resourceUri = "metadata://active-file";
const resourceName = "Active File";
export const metadata: ResourceMetadata = {
  mimeType: "application/json",
  description: "Metadata of the active File.",
};

export const registerActiveFileResource = (app: App, mcpServer: McpServer) =>
  mcpServer.resource(resourceName, resourceUri, metadata, async (uri) => {
    try {
      const file = app.workspace.getActiveFile();
      if (!file) {
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify({ error: "No file open" }),
            },
          ],
          isError: true,
        };
      }

      const fileMetadata = await getFileMetadataObject(app, file);
      const content = JSON.stringify(fileMetadata);

      return { contents: [{ uri: uri.href, text: content }] };
    } catch (e) {
      return {
        contents: [{ uri: uri.href, text: JSON.stringify({ error: `${e}` }) }],
        isError: true,
      };
    }
  });
