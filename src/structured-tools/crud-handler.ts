import { App, TFile, normalizePath } from "obsidian";
import { ValidatedSchema } from "./schema";
import { CallToolResult } from "@modelcontextprotocol/sdk/types";
import yaml from "js-yaml";
import { saveRollback } from "../utils/helpers";

/**
 * Generic handler for updating or creating vault files based on a schema definition.
 */
export async function handleStructuredUpdate(
  app: App,
  schema: ValidatedSchema,
  inputArgs: Record<string, unknown>,
): Promise<CallToolResult> {
  try {
    // 1. Validate required path components and identifier field
    const missingPathComponents = schema.metadata.pathComponents.filter(
      component => !(component in inputArgs) || typeof inputArgs[component] !== "string",
    );

    if (missingPathComponents.length > 0) {
      return {
        content: [
          {
            type: "text",
            text: `Missing or invalid path components: ${missingPathComponents.join(", ")}`,
          },
        ],
        isError: true,
      };
    }

    // Check identifier field
    const identifierField = schema.metadata.identifierField;
    if (!(identifierField in inputArgs)) {
      return {
        content: [
          {
            type: "text",
            text: `Missing required identifier field: ${identifierField}`,
          },
        ],
        isError: true,
      };
    }

    // 2. Construct the target path
    let targetPath = schema.metadata.pathTemplate;

    // Replace path components
    for (const component of schema.metadata.pathComponents) {
      targetPath = targetPath.replace(`\${${component}}`, inputArgs[component] as string);
    }

    // Replace identifier field if it's different from path components
    if (!schema.metadata.pathComponents.includes(identifierField)) {
      targetPath = targetPath.replace(
        `\${${identifierField}}`,
        String(inputArgs[identifierField]), // eslint-disable-line @typescript-eslint/no-base-to-string
      );
    }

    // Normalize path and ensure .md extension
    targetPath = normalizePath(targetPath);
    if (!targetPath.endsWith(".md")) {
      targetPath += ".md";
    }

    // 3. Prepare data with metadata
    let dataToSave: Record<string, unknown> = { ...inputArgs };

    // 4. Handle file operations
    const file = app.vault.getAbstractFileByPath(targetPath);

    if (!file) {
      // Create new file with directory structure
      const dir = targetPath.substring(0, targetPath.lastIndexOf("/"));
      if (dir) {
        await app.vault.createFolder(dir).catch(() => {}); // Ignore if exists
      }

      const yamlContent = "---\n" + yaml.dump(dataToSave) + "---\n";
      await app.vault.create(targetPath, yamlContent);
      return {
        content: [
          {
            type: "text",
            text: `Created new file: ${targetPath}`,
          },
        ],
      };
    }

    // Verify it's a file not a folder
    if (!(file instanceof TFile)) {
      return {
        content: [
          {
            type: "text",
            text: `Path exists but is a folder: ${targetPath}`,
          },
        ],
        isError: true,
      };
    }

    // Update existing file
    const content = await app.vault.cachedRead(file);
    // Save rollback before modifying
    await saveRollback(app, targetPath, "structured-update");
    const cache = app.metadataCache.getFileCache(file);
    let body = "";

    if (cache?.frontmatter && cache.frontmatterPosition) {
      // Merge existing frontmatter with new data, preferring new data, but keeping existing keys
      const existingData = cache.frontmatter;
      dataToSave = {
        ...existingData,
        ...dataToSave,
      };

      // Extract body content after frontmatter
      body = content.slice(cache.frontmatterPosition.end.offset);
    }

    // Generate new content with updated frontmatter
    const yamlContent = "---\n" + yaml.dump(dataToSave) + "---\n";
    const newContent = yamlContent + (body || "\n");
    await app.vault.modify(file, newContent);

    return {
      content: [
        {
          type: "text",
          text: `Updated existing file: ${targetPath}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
