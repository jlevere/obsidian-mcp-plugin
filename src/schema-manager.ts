import { App, TFile, TFolder, normalizePath } from 'obsidian';
import yaml from 'js-yaml';

// Define the structure for items within an array field
export interface SchemaFieldItems {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'; // Added 'object', 'array'
  properties?: Record<string, any>; // For items type 'object'
  items?: SchemaFieldItems; // For items type 'array' (recursive definition for nested arrays)
}

// Define the structure for a single field within a schema
export interface SchemaFieldDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';
  description: string;
  optional: boolean;
  default?: any; // Default value (type consistency check needed later)
  items?: SchemaFieldItems; // Use the new interface
  properties?: Record<string, any>; // For type: 'object' (simplified for now)
}

// Define the structure for a complete schema definition parsed from YAML
export interface SchemaDefinition {
  schemaName: string;
  description: string;
  identifierField: string;
  pathTemplate: string;
  pathComponents: string[];
  fields: SchemaFieldDefinition[];
}

const SCHEMA_DIRECTORY = 'Metadata/Schemas';

/**
 * Finds Markdown files in the schema directory, extracts YAML schema blocks,
 * parses them, validates basic structure, and returns valid definitions.
 * @param app Obsidian App instance
 * @returns A promise that resolves to an array of validated SchemaDefinition objects.
 */
export async function findAndParseSchemas(app: App): Promise<SchemaDefinition[]> {
  const validSchemas: SchemaDefinition[] = [];
  const targetFolderPath = normalizePath(SCHEMA_DIRECTORY).toLowerCase(); // Lowercase for comparison
  let schemaFolder: TFolder | null = null;

  // Iterate through all loaded files/folders to find the target folder case-insensitively
  console.log(`Searching for schema folder: ${targetFolderPath}`);
  for (const abstractFile of app.vault.getAllLoadedFiles()) {
    if (abstractFile instanceof TFolder && abstractFile.path.toLowerCase() === targetFolderPath) {
      schemaFolder = abstractFile;
      console.log(`Found matching folder: ${abstractFile.path}`);
      break; // Found it
    }
  }

  // Check if the folder was found
  if (!schemaFolder) {
    console.log(`Schema directory '${SCHEMA_DIRECTORY}' not found among loaded folders. Skipping dynamic tool generation.`);
    return []; // Return empty array if not found
  }

  console.log(`Using schema folder: ${schemaFolder.path}`);

  // Filter for Markdown files directly within the schema folder
  const schemaFiles = schemaFolder.children.filter(
    (file): file is TFile => file instanceof TFile && file.extension === 'md'
  );

  console.log(`Found ${schemaFiles.length} potential schema files in '${SCHEMA_DIRECTORY}'.`);

  for (const file of schemaFiles) {
    console.log(`Processing schema file: ${file.path}`);
    try {
      const content = await app.vault.read(file);

      // Regex to find the first YAML block tagged with 'schema'
      const yamlRegex = /```yaml\s+schema\s*\n([\s\S]*?)\n```/;
      const match = content.match(yamlRegex);

      if (!match || !match[1]) {
        console.warn(`Skipping file ${file.path}: No 'yaml schema' code block found.`);
        continue;
      }

      const yamlContent = match[1];
      // Use try-catch specifically for YAML parsing
      let parsedYaml: any;
      try {
        parsedYaml = yaml.load(yamlContent);
      } catch (yamlError) {
        console.warn(`Skipping file ${file.path}: Failed to parse YAML content. Error: ${yamlError instanceof Error ? yamlError.message : String(yamlError)}`);
        continue; // Skip to the next file if YAML is invalid
      }


      // Basic validation
      if (!parsedYaml || typeof parsedYaml !== 'object') {
        console.warn(`Skipping file ${file.path}: Parsed YAML is not a valid object.`);
        continue;
      }

      // Check for required top-level keys
      const requiredKeys: (keyof SchemaDefinition)[] = ['schemaName', 'description', 'identifierField', 'pathTemplate', 'pathComponents', 'fields'];
      const missingKeys = requiredKeys.filter(key => !(key in parsedYaml));

      if (missingKeys.length > 0) {
        console.warn(`Skipping file ${file.path}: Missing required top-level schema keys: ${missingKeys.join(', ')}.`);
        continue;
      }

      // Basic type checks for required keys
      if (typeof parsedYaml.schemaName !== 'string' ||
        typeof parsedYaml.description !== 'string' ||
        typeof parsedYaml.identifierField !== 'string' ||
        typeof parsedYaml.pathTemplate !== 'string' ||
        !Array.isArray(parsedYaml.pathComponents) ||
        !Array.isArray(parsedYaml.fields)) {
        console.warn(`Skipping file ${file.path}: Invalid types for required top-level schema keys.`);
        continue;
      }

      // Further validation: Check if identifierField exists within the fields list
      const identifierExists = parsedYaml.fields.some((field: any) =>
        typeof field === 'object' && field !== null && field.name === parsedYaml.identifierField
      );
      if (!identifierExists) {
        console.warn(`Skipping file ${file.path}: The identifierField '${parsedYaml.identifierField}' is not defined in the fields list or field structure is invalid.`);
        continue;
      }

      // Assume valid structure at this point (can be refined)
      // We cast here after validation checks
      const schemaDefinition: SchemaDefinition = parsedYaml as SchemaDefinition;
      validSchemas.push(schemaDefinition);
      console.log(`Successfully parsed and validated schema: ${schemaDefinition.schemaName} from ${file.path}`);

    } catch (error) {
      // Catch errors from file reading or other unexpected issues
      console.error(`Unexpected error processing schema file ${file.path}:`, error);
    }
  }

  return validSchemas;
} 