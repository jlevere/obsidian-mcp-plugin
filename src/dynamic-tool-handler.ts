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

// Helper defined *before* processFieldToZod to handle recursive structure
function generateShapeFromSchemaProperties(properties: Record<string, any>, parentFieldName: string): z.ZodRawShape {
  const shape: z.ZodRawShape = {};
  if (!properties || typeof properties !== 'object') {
    console.warn(`Invalid 'properties' provided for field '${parentFieldName}'. Expected an object.`);
    return {}; // Return empty shape for invalid properties
  }

  for (const propName in properties) {
    if (Object.prototype.hasOwnProperty.call(properties, propName)) {
      const propDefinition = properties[propName];

      // Validate the structure of the property definition
      if (propDefinition && typeof propDefinition === 'object' && typeof propDefinition.type === 'string') {
        // Construct a SchemaFieldDefinition-like object for processFieldToZod
        // We cast 'type' assuming it's one of the known types; Zod validation will catch issues later.
        const fieldDefinition: SchemaFieldDefinition = {
          name: propName,
          type: propDefinition.type as SchemaFieldDefinition['type'],
          description: propDefinition.description || `Property ${propName}`,
          optional: propDefinition.optional === true, // Defaults to false if undefined/not true
          default: propDefinition.default,
          items: propDefinition.items,
          properties: propDefinition.properties
        };
        // Call processFieldToZod (defined below) to get the Zod type for this property
        shape[propName] = processFieldToZod(fieldDefinition);
      } else {
        console.warn(`Invalid property definition for '${propName}' in properties of '${parentFieldName}'. Skipping.`);
        // Optionally add z.any() as a fallback:
        // shape[propName] = z.any().describe(`Skipped invalid property: ${propName}`);
      }
    }
  }
  return shape;
}

// Helper defined *after* generateShapeFromSchemaProperties
function processFieldToZod(field: SchemaFieldDefinition): z.ZodType<any, any, any> {
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
      // Allow empty strings/null/undefined to clear the date, otherwise expect ISO8601
      fieldSchema = z.preprocess(
        (val) => (val === "" || val === null || val === undefined ? undefined : val),
        z.string().datetime({ message: `Invalid ISO8601 datetime string for ${field.name}` })
      );
      break;
    case 'array':
      const items = field.items;
      if (!items || !items.type) {
        console.warn(`Array field '${field.name}' is missing 'items' definition or item 'type'. Defaulting to array of any.`);
        fieldSchema = z.array(z.any());
      } else {
        switch (items.type) {
          case 'string': fieldSchema = z.array(z.string()); break;
          case 'number': fieldSchema = z.array(z.number()); break;
          case 'boolean': fieldSchema = z.array(z.boolean()); break;
          case 'object':
            // Check if properties exist for the object items
            if (items.properties && typeof items.properties === 'object') {
              // Generate the shape for the objects within the array
              const itemShape = generateShapeFromSchemaProperties(items.properties, `${field.name} items`);
              fieldSchema = z.array(z.object(itemShape));
            } else {
              console.warn(`Array field '${field.name}' has item type 'object' but invalid/missing 'properties'. Defaulting to array of record<string, any>.`);
              // Fallback for object arrays without defined properties
              fieldSchema = z.array(z.record(z.any()));
            }
            break;
          // Handling nested arrays (array within an array's items) - currently limited
          case 'array':
            console.warn(`Nested arrays (array within array items) are not fully supported yet for field '${field.name}'. Defaulting outer array to array of any.`);
            fieldSchema = z.array(z.any()); // Fallback for nested arrays
            break;
          default:
            // Handle unknown item types
            console.warn(`Unsupported array item type '${items.type}' for field '${field.name}'. Defaulting to array of any.`);
            fieldSchema = z.array(z.any());
        }
      }
      break; // End case 'array'
    case 'object':
      // Check if properties exist for the object field
      if (field.properties && typeof field.properties === 'object') {
        // Generate the shape for the object's properties
        const shape = generateShapeFromSchemaProperties(field.properties, field.name);
        fieldSchema = z.object(shape);
      } else {
        console.warn(`Object field '${field.name}' has invalid/missing 'properties'. Defaulting to record of any.`);
        // Fallback for object fields without defined properties
        fieldSchema = z.record(z.any());
      }
      break;
    default:
      // Handle unknown field types specified in the schema
      console.warn(`Unsupported field type '${field.type}' for field '${field.name}'. Defaulting to z.string().`);
      fieldSchema = z.string();
  }

  // Apply optional modifier AFTER defining the base type
  if (field.optional) {
    if (field.default !== undefined) {
      try {
        // Validate default value type consistency before applying .default()
        if (field.type === 'array' && !Array.isArray(field.default)) {
          console.warn(`Default value for array field '${field.name}' is not an array. Applying .optional() without default.`);
          fieldSchema = fieldSchema.optional();
        } else if (field.type === 'date') {
          // Avoid defaulting date types automatically unless specifically intended
          console.warn(`Default value provided for date field '${field.name}'. Applying .optional() without default. Handle defaults explicitly if needed.`);
          fieldSchema = fieldSchema.optional();
        }
        // TODO: Add consistency check for object defaults if needed
        // else if (field.type === 'object' && (typeof field.default !== 'object' || field.default === null || Array.isArray(field.default))) { ... }
        else {
          // Apply default if type seems consistent
          fieldSchema = fieldSchema.optional().default(field.default);
        }
      } catch (e) {
        // Catch errors during .default() application (e.g., Zod type mismatch)
        console.error(`Error applying default value for field '${field.name}'. Default: ${JSON.stringify(field.default)}, Type: ${field.type}. Error: ${e instanceof Error ? e.message : String(e)}. Applying .optional() without default.`);
        fieldSchema = fieldSchema.optional(); // Fallback to optional only
      }
    } else {
      // Optional without a default value
      fieldSchema = fieldSchema.optional();
    }
  }

  // Apply description, using field name as fallback
  fieldSchema = fieldSchema.describe(field.description || field.name);

  return fieldSchema;
}


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
    // For now, assume they are distinct top-level inputs. Prefixing or checking later might be needed.
    if (zodSchemaDefinition[component]) {
      console.warn(`Path component name '${component}' conflicts with another path component. Overwriting.`);
    }
    zodSchemaDefinition[component] = z.string().describe(`Required path component: ${component}`);
  }

  // 2. Add fields from the schema definition using the helper function
  for (const field of definition.fields) {
    // Get the Zod type for the current field using the processing helper
    const fieldSchema = processFieldToZod(field);

    // Add the processed field schema to the main definition object, checking for conflicts
    if (zodSchemaDefinition[field.name]) {
      // Log conflict if a field name clashes with a path component or another field (though field clashes shouldn't happen if schema is valid)
      console.warn(`Field name '${field.name}' conflicts with a path component or another field. The previous definition (likely path component) will be overwritten by the field definition.`);
    }
    zodSchemaDefinition[field.name] = fieldSchema;
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