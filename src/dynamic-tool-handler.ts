import { App, TFile, normalizePath } from "obsidian";
import { z } from "zod";
import { SchemaDefinition, SchemaFieldDefinition } from "./schema-manager"; // Import definitions
import {
  createFileWithFrontmatter,
  mergeDataWithDefaults,
  parseFrontmatter,
  updateFileFrontmatter,
  findFileCaseInsensitive // Assuming this will be added/available
} from "./utils/obsidian-crud-utils"; // Import CRUD utils

/**
 * Generates a Zod schema RAW SHAPE object based on a parsed SchemaDefinition.
 * @param definition The schema definition parsed from YAML.
 * @returns A ZodRawShape schema shape for use with the MCP tool.
 */
export function generateZodSchema(definition: SchemaDefinition): z.ZodRawShape {
  let zodSchemaDefinition: z.ZodRawShape = {};

  // 1. Add required path components as required string inputs
  for (const component of definition.pathComponents) {
    // Ensure path components don't clash with actual fields, maybe prefix?
    // For now, assume they are distinct top-level inputs.
    zodSchemaDefinition[component] = z.string().describe(`Required path component: ${component}`);
  }

  // 2. Add fields from the schema definition
  for (const field of definition.fields) {
    let fieldSchema: z.ZodType<any, any, any>;

    switch (field.type) {
      case 'string':
        fieldSchema = z.string();
        break;
      case 'number':
        fieldSchema = z.number();
        break;
      case 'boolean':
        fieldSchema = z.boolean();
        break;
      case 'date':
        // Use preprocess for flexibility, allowing empty strings or actual dates
        fieldSchema = z.preprocess(
          (val) => (val === "" || val === null || val === undefined ? undefined : val), // Allow clearing date? Maybe require ISO string?
          z.string().datetime({ message: `Invalid ISO8601 datetime string for ${field.name}` })
        );
        // Do not apply default here for 'date' type if it's 'last_modified' or similar auto-field
        // Defaulting dates might be complex, handle via 'optional' + auto-set logic
        break;
      case 'array':
        // Basic array handling - assumes array of strings for now based on example
        // Needs refinement for arrays of objects or other types based on `field.items`
        if (field.items?.type === 'string') {
          fieldSchema = z.array(z.string());
        } else if (field.items?.type === 'number') {
          fieldSchema = z.array(z.number());
        } else if (field.items?.type === 'boolean') {
          fieldSchema = z.array(z.boolean());
        } else {
          // Default to array of strings or maybe z.any() if item type is complex/unknown
          console.warn(`Unsupported array item type '${field.items?.type}' for field '${field.name}'. Defaulting to array of strings.`);
          fieldSchema = z.array(z.string());
          // TODO: Handle array of objects based on field.items.properties if needed
        }
        break;
      case 'object':
        // Basic object handling - allows any object structure
        // TODO: Recursively generate schema based on field.properties if needed
        fieldSchema = z.record(z.any()); // Or z.object({}).passthrough();
        break;
      default:
        console.warn(`Unsupported field type '${field.type}' for field '${field.name}'. Defaulting to z.string().`);
        fieldSchema = z.string(); // Default to string for unknown types
    }

    // Apply optional modifier if applicable
    if (field.optional) {
      // If a default value is provided, apply it along with optional()
      if (field.default !== undefined) {
        // Need careful type casting/validation for default values
        try {
          // Attempt to apply default. Zod will validate type consistency.
          // For arrays, ensure the default is an array. For dates, default might be tricky.
          if (field.type === 'array' && !Array.isArray(field.default)) {
            console.warn(`Default value for array field '${field.name}' is not an array. Ignoring default.`);
            fieldSchema = fieldSchema.optional();
          } else if (field.type === 'date' && field.default !== undefined) {
            // Generally avoid defaulting 'date' types like last_modified
            console.warn(`Default value provided for date field '${field.name}'. Ignoring default; use optional only.`);
            fieldSchema = fieldSchema.optional();
          }
          else {
            fieldSchema = fieldSchema.optional().default(field.default);
          }
        } catch (e) {
          console.error(`Error applying default value for field '${field.name}'. Default: ${field.default}, Type: ${field.type}. Error: ${e instanceof Error ? e.message : String(e)}`);
          fieldSchema = fieldSchema.optional(); // Fallback to just optional if default fails
        }

      } else {
        fieldSchema = fieldSchema.optional();
      }
    }

    // Add description
    fieldSchema = fieldSchema.describe(field.description);

    // Add the field schema to the main definition object
    // Ensure field names don't clash with path components (could happen if schema reuses names)
    if (zodSchemaDefinition[field.name]) {
      console.warn(`Field name '${field.name}' conflicts with a path component. Path component definition will be used.`);
    } else {
      zodSchemaDefinition[field.name] = fieldSchema;
    }
  }

  // Return the raw shape object directly
  return zodSchemaDefinition;
}


/**
 * Generic handler for updating or creating vault files based on a schema definition.
 * @param app Obsidian App instance.
 * @param definition The schema definition for the specific tool being run.
 * @param inputArgs The validated input arguments from the MCP tool call.
 * @returns A promise resolving to the MCP response object.
 */
export async function handleGenericUpdate(
  app: App,
  definition: SchemaDefinition,
  inputArgs: Record<string, any>
) /* : Promise<McpToolResponse> */ { // Let TypeScript infer the return type

  // 1. Construct the target path
  let targetPath = definition.pathTemplate;
  try {
    // Substitute path components
    for (const component of definition.pathComponents) {
      if (!(component in inputArgs) || typeof inputArgs[component] !== 'string') {
        throw new Error(`Missing or invalid required path component argument: ${component}`);
      }
      // Basic substitution - might need more robust templating for complex cases
      targetPath = targetPath.replace(`\${${component}}`, inputArgs[component]);
    }
    // Substitute identifier field
    const identifierValue = inputArgs[definition.identifierField];
    if (identifierValue === undefined || identifierValue === null) {
      throw new Error(`Missing required identifier field argument: ${definition.identifierField}`);
    }
    // Ensure identifier is string-like for path
    targetPath = targetPath.replace(`\${${definition.identifierField}}`, String(identifierValue));

    targetPath = normalizePath(targetPath);
    if (!targetPath.toLowerCase().endsWith('.md')) {
      console.warn(`Generated path "${targetPath}" does not end with .md. Appending .md`);
      targetPath += '.md';
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error constructing path for ${definition.schemaName}: ${message}`);
    // Return simple object compatible with MCP structure
    return {
      content: [{ type: "text", text: `Error constructing file path: ${message}` } as const],
      isError: true,
    };
  }

  console.log(`Processing ${definition.schemaName} update/create for path: ${targetPath}`);

  // 2. Prepare data for frontmatter
  const dataToSave: Record<string, any> = {};
  const defaults: Record<string, any> = {};

  // Filter input args based on defined fields and add identifier/last_modified
  for (const field of definition.fields) {
    if (field.name in inputArgs) {
      // Only include fields explicitly provided in the input args
      // Zod defaults should have already been applied if field was optional and not provided
      dataToSave[field.name] = inputArgs[field.name];
    } else if (!field.optional && field.name !== 'last_modified') {
      // This case should ideally be caught by Zod if schema is generated correctly
      console.warn(`Required field '${field.name}' missing from input args after Zod parsing. This might indicate an issue.`);
      // Optionally handle this case, e.g., by throwing error or using a fallback. For now, just warn.
    }

    // Collect defaults specified in the schema for merging later
    if (field.default !== undefined) {
      defaults[field.name] = field.default;
    }
  }

  // Ensure identifier field is in the data, even if not explicitly listed as a regular field sometimes
  dataToSave[definition.identifierField] = inputArgs[definition.identifierField];

  // Always add/update last_modified
  dataToSave['last_modified'] = new Date().toISOString();


  // 3. Perform CRUD operation
  try {
    // Use case-insensitive finder (assuming it exists/will be added)
    let file = findFileCaseInsensitive(app, targetPath);

    if (!file) {
      console.log(`File not found: ${targetPath}. Attempting creation...`);
      try {
        // Attempt to create file with the filtered data
        file = await createFileWithFrontmatter(app, targetPath, dataToSave);
        // Return simple object
        return { content: [{ type: "text", text: `${definition.schemaName} file created: ${targetPath}` } as const] };
      } catch (creationError: any) {
        // Handle the specific "already exists" error gracefully
        if (creationError?.alreadyExists === true) {
          console.warn(`Creation failed because file already exists (caught in handler): ${targetPath}. Retrying find & update...`);
          file = findFileCaseInsensitive(app, targetPath); // Try finding it again
          if (!file) {
            // Explicitly check if file is still null after retry
            throw new Error(`File reported as existing during creation, but could not be found afterwards: ${targetPath}`);
          }
          console.log(`Found file ${targetPath} after failed creation attempt. Proceeding with update.`);
          // Fall through to update logic below
        } else {
          throw creationError; // Re-throw other creation errors
        }
      }
    }

    // --- Update Logic ---
    if (file instanceof TFile) {
      console.log(`Found existing file: ${targetPath}. Proceeding with update.`);
      const originalContent = await app.vault.read(file);
      const cache = app.metadataCache.getFileCache(file) ?? null; // Handle null cache
      const { data: existingData } = parseFrontmatter(originalContent, cache);

      // Use the collected schema defaults for merging
      const mergedData = mergeDataWithDefaults(existingData, dataToSave, defaults);

      await updateFileFrontmatter(app, file, mergedData);
      // Return simple object
      return { content: [{ type: "text", text: `${definition.schemaName} file updated: ${targetPath}` } as const] };
    } else {
      // Should only happen if findFileCaseInsensitive returns something other than TFile or null
      throw new Error(`Path exists but is not a regular file: ${targetPath}`);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error processing ${definition.schemaName} file operation for ${targetPath}:`, err);
    // Make error message slightly more specific
    const finalMessage = message.startsWith('Failed to') || message.startsWith('File reported as existing')
      ? message
      : `Error processing ${definition.schemaName} file: ${message}`;
    // Return simple object
    return {
      content: [{ type: "text", text: finalMessage } as const],
      isError: true,
    };
  }
}