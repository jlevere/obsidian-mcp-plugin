import { App, TFile, normalizePath } from "obsidian";
import yaml from "js-yaml";
import { StructuredManagerConfig } from "../managers/StructuredManager";
import Ajv from "ajv";
import metaSchema from "./meta-schema.json";
import { JSONSchemaToZod } from "@dmitryrechkin/json-schema-to-zod";
import { z } from "zod";

// Define the structure that matches our meta-schema
export interface ValidatedSchema {
  metadata: {
    schemaName: string;
    description: string;
    identifierField: string;
    pathTemplate: string;
    pathComponents: string[];
  };
  fields: any;
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
  config: StructuredManagerConfig
): Promise<ValidatedSchema[]> {
  const validSchemas: ValidatedSchema[] = [];
  const targetFolderPath = normalizePath(config.schemaDirectory);

  // Get the schema folder directly
  const schemaFolder = app.vault.getFolderByPath(targetFolderPath);

  if (!schemaFolder) {
    console.log(
      `Schema directory '${config.schemaDirectory}' not found. Skipping dynamic tool generation.`
    );
    return [];
  }

  // Filter for Markdown files directly within the schema folder
  const schemaFiles = schemaFolder.children.filter(
    (file): file is TFile => file instanceof TFile && file.extension === "md"
  );

  for (const file of schemaFiles) {
    try {
      const content = await app.vault.read(file);
      const yamlRegex = /```yaml\s+schema\s*\n([\s\S]*?)\n```/;
      const match = content.match(yamlRegex);

      if (!match || !match[1]) {
        console.warn(
          `Skipping file ${file.path}: No 'yaml schema' code block found.`
        );
        continue;
      }

      const yamlContent = match[1];
      let parsedYaml: unknown;
      try {
        parsedYaml = yaml.load(yamlContent);
      } catch (yamlError) {
        console.warn(
          `Skipping file ${file.path}: Failed to parse YAML content. Error: ${
            yamlError instanceof Error ? yamlError.message : String(yamlError)
          }`
        );
        continue;
      }

      if (
        typeof parsedYaml !== "object" ||
        !parsedYaml ||
        !("fields" in parsedYaml)
      ) {
        console.warn(
          `Skipping file ${file.path}: Parsed YAML must have a fields section`
        );
        continue;
      }

      // Validate that the fields section is a valid JSON Schema
      if (!ajv.validateSchema(parsedYaml)) {
        console.warn(
          `Skipping file ${file.path}: Invalid JSON Schema:`,
          ajv.errors
        );
        continue;
      }

      // Then validate against our meta-schema
      if (!validateSchema(parsedYaml)) {
        console.warn(
          `Skipping file ${file.path}: Schema validation failed:`,
          validateSchema.errors
        );
        continue;
      }

      // At this point TypeScript knows parsedYaml matches ValidatedSchema
      const validatedYaml = parsedYaml as ValidatedSchema;

      validSchemas.push(validatedYaml);
      console.log(
        `Successfully parsed and validated schema: ${validatedYaml.metadata.schemaName} from ${file.path}`
      );
    } catch (error) {
      console.error(
        `Unexpected error processing schema file ${file.path}:`,
        error
      );
    }
  }

  return validSchemas;
}

/**
 * Generates a Zod schema from a schema definition
 */
export function generateZodSchema(schema: ValidatedSchema): z.ZodObject<any> {
  if (!schema.fields || typeof schema.fields !== "object") {
    throw new Error("Schema fields must be a valid object");
  }

  try {
    console.log("Raw schema fields:", schema.fields);

    // Extract required fields (non-optional fields)
    const required = Object.entries(schema.fields)
      .filter(([_, field]) => {
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

    console.log("Generated JSON Schema:", JSON.stringify(jsonSchema, null, 2));

    // Convert JSON Schema to Zod
    const zodSchema = JSONSchemaToZod.convert(jsonSchema);
    // @ts-ignore shape exists at runtime but TypeScript doesn't know about it
    console.log("Generated Zod Schema:", zodSchema.shape);

    return zodSchema as z.ZodObject<any>;
  } catch (error) {
    console.error("Schema generation error:", error);
    throw new Error(
      `Failed to generate Zod schema: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
