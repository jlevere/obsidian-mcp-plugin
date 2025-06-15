import { App } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findAndParseSchemas } from "./schema";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import { StructuredManagerConfig } from "../managers/StructuredManager";

interface SchemaField {
  type: string;
  required?: boolean;
  description?: string;
  [key: string]: unknown;
}

const description = `
Lists all available schemas and their details. Each schema defines a data structure that can be managed through structured tools.
`;

export function registerListSchemasHandler(
  app: App,
  mcpServer: McpServer,
  config: StructuredManagerConfig,
): void {
  mcpServer.tool(
    "obsidian-mcp-list-schemas",
    description,
    z.object({}).shape,
    async (): Promise<CallToolResult> => {
      try {
        const schemas = await findAndParseSchemas(app, config);

        if (schemas.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No schema files found in the schemas directory",
              },
            ],
          };
        }

        // Return detailed information about each schema
        return {
          content: schemas.map(schema => ({
            type: "text" as const,
            text: [
              `Schema: ${schema.metadata.schemaName}`,
              `Description: ${schema.metadata.description}`,
              `Path Template: ${schema.metadata.pathTemplate}`,
              `Required Fields: ${schema.metadata.pathComponents.join(", ")}`,
              `Fields:`,
              ...Object.entries(schema.fields as Record<string, SchemaField>).map(
                ([name, field]) =>
                  `  - ${name} (${field.type})${
                    field.required ? "" : " (optional)"
                  }: ${field.description || ""}`,
              ),
            ].join("\n"),
          })),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error listing schemas: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
