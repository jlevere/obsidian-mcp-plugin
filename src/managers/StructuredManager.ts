import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  findAndParseSchemas,
  generateZodSchema,
} from "../structured-tools/schema";
import { handleStructuredUpdate } from "../structured-tools/crud-handler";
import { registerListSchemasHandler } from "../structured-tools/list-schemas";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";

export interface StructuredManagerConfig {
  enabled: boolean;
  schemaDirectory: string;
  disabledTools: Set<string>;
}

/**
 * Manages structured data tools and schema-based operations
 */
export class StructuredManager {
  private app: App;
  private config: StructuredManagerConfig;

  constructor(app: App, config: StructuredManagerConfig) {
    this.app = app;
    this.config = config;
  }

  /**
   * Registers schema-based tools with the MCP server
   */
  public async registerTools(mcpServer: McpServer): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Register list-schemas tool first
      if (!this.config.disabledTools.has("obsidian-mcp-list-schemas")) {
        registerListSchemasHandler(this.app, mcpServer, this.config);
      }

      const schemas = await findAndParseSchemas(this.app, this.config);

      // Register individual update tools for each schema
      for (const schema of schemas) {
        const toolName = `obsidian-mcp-update-${schema.metadata.schemaName.toLowerCase()}`;

        // Skip if tool is disabled
        if (this.config.disabledTools.has(toolName)) {
          continue;
        }

        try {
          const zodSchema = generateZodSchema(schema);
          mcpServer.tool(
            toolName,
            `Update ${
              schema.metadata.schemaName
            } content using the following template: ${
              schema.metadata.pathTemplate
            }
Required fields: ${schema.metadata.pathComponents.join(", ")}
${schema.metadata.description}`,
            zodSchema.shape,
            async (args: Record<string, unknown>): Promise<CallToolResult> => {
              return await handleStructuredUpdate(this.app, schema, args);
            },
          );
        } catch (error) {
          console.error(
            `Error registering structured tool ${toolName}:`,
            error,
          );
        }
      }
    } catch (error) {
      console.error("Error registering structured tools:", error);
    }
  }

  /**
   * Gets the list of available dynamic tools, including list-schemas and schema-based tools
   */
  public async getDynamicTools(): Promise<string[]> {
    if (!this.config.enabled) {
      return [];
    }

    const tools: string[] = [];

    try {
      const schemas = await findAndParseSchemas(this.app, this.config);
      if (schemas.length > 0) {
        tools.push("obsidia-mcp-list-schemas");
        for (const schema of schemas) {
          const toolName = `obsidian-mcp-update-${schema.metadata.schemaName.toLowerCase()}`;
          tools.push(toolName);
        }
      }
    } catch (error) {
      console.error("Error getting dynamic tools:", error);
    }

    return tools;
  }
}
