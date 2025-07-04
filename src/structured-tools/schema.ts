import { App, TFile, normalizePath, parseYaml } from "obsidian";
import { StructuredManagerConfig } from "../managers/StructuredManager";
import Ajv from "ajv";
import metaSchema from "./meta-schema.json";
import { JSONSchemaToZod } from "@dmitryrechkin/json-schema-to-zod";
import { z } from "zod";
import { PLUGIN_NAME } from "../constants";

// Define the structure that matches our meta-schema
export interface ValidatedSchema {
  metadata: {
    schemaName: string;
    description: string;
    identifierField: string;
    pathTemplate: string;
    pathComponents: string[];
  };
  fields: Record<string, unknown>;
}

// Initialize AJV validator with JSON Schema draft-07
const ajv = new Ajv({
  strict: true,
  strictSchema: true,
  validateSchema: true,
  allErrors: true,
  verbose: true,
});

const validateSchema = ajv.compile<ValidatedSchema>(metaSchema);

/**
 * Finds Markdown files in the schema directory, extracts YAML schema blocks,
 * parses them, validates basic structure, and returns valid definitions.
 */
export async function findAndParseSchemas(
  app: App,
  config: StructuredManagerConfig,
): Promise<ValidatedSchema[]> {
  const validSchemas: ValidatedSchema[] = [];
  const targetFolderPath = normalizePath(config.schemaDirectory);

  // Get the schema folder directly
  const schemaFolder = app.vault.getFolderByPath(targetFolderPath);

  if (!schemaFolder) {
    console.log(
      `${PLUGIN_NAME} Schema directory '${config.schemaDirectory}' not found. Skipping dynamic tool generation.`,
    );
    return [];
  }

  // Filter for Markdown files directly within the schema folder
  const schemaFiles = schemaFolder.children.filter(
    (file): file is TFile => file instanceof TFile && file.extension === "md",
  );

  for (const file of schemaFiles) {
    try {
      const content = await app.vault.read(file);
      const yamlRegex = /```yaml\s+schema\s*\n([\s\S]*?)\n```/;
      const match = content.match(yamlRegex);

      if (!match || !match[1]) {
        console.warn(`Skipping file ${file.path}: No 'yaml schema' code block found.`);
        continue;
      }

      const yamlContent = match[1];
      let parsedYaml: unknown;
      try {
        parsedYaml = parseYaml(yamlContent);
      } catch (yamlError) {
        console.warn(
          `Skipping file ${file.path}: Failed to parse YAML content. Error: ${
            yamlError instanceof Error ? yamlError.message : String(yamlError)
          }`,
        );
        continue;
      }

      if (typeof parsedYaml !== "object" || !parsedYaml || !("fields" in parsedYaml)) {
        console.warn(`Skipping file ${file.path}: Parsed YAML must have a fields section`);
        continue;
      }

      // Validate that the fields section is a valid JSON Schema
      if (!ajv.validateSchema(parsedYaml)) {
        console.warn(`Skipping file ${file.path}: Invalid JSON Schema:`, ajv.errors);
        continue;
      }

      // Then validate against our meta-schema
      if (!validateSchema(parsedYaml)) {
        console.warn(
          `Skipping file ${file.path}: Schema validation failed:`,
          validateSchema.errors,
        );
        continue;
      }

      const validatedYaml = parsedYaml;
      const meta = validatedYaml.metadata;
      const fields = validatedYaml.fields;

      let allPathComponentsPresent = true;
      for (const component of meta.pathComponents) {
        if (!(component in fields)) {
          console.warn(
            `Skipping file ${file.path}: metadata.pathComponents "${component}" is not present in fields.`,
          );
          allPathComponentsPresent = false;
          break;
        }
      }
      if (!allPathComponentsPresent) continue;

      validSchemas.push(validatedYaml);
    } catch (error) {
      console.error(`Unexpected error processing schema file ${file.path}:`, error);
    }
  }

  return validSchemas;
}

/**
 * Generates a Zod schema from a schema definition
 */
export function generateZodSchema(schema: ValidatedSchema): z.ZodObject<z.ZodRawShape> {
  if (!schema.fields || typeof schema.fields !== "object") {
    throw new Error("Schema fields must be a valid object");
  }

  try {
    // Extract required fields (non-optional fields)
    const required = Object.entries(schema.fields)
      .filter(([, field]) => {
        const typedField = field as { type: string; optional?: boolean };
        return typeof field === "object" && field && !typedField.optional;
      })
      .map(([name]) => name);

    // Create JSON Schema
    const jsonSchema = {
      type: "object",
      properties: schema.fields,
      required: required,
      additionalProperties: false,
    };

    // Convert JSON Schema to Zod
    const zodSchema = JSONSchemaToZod.convert(jsonSchema);

    return zodSchema as z.ZodObject<z.ZodRawShape>;
  } catch (error) {
    console.error("Schema generation error:", error);
    throw new Error(
      `Failed to generate Zod schema: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
