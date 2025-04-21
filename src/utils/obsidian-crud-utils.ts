import { App, TFile, TFolder, normalizePath, MetadataCache } from 'obsidian';
import yaml from 'js-yaml';

/**
 * Ensures the directory path exists. Creates it recursively if needed.
 * @param app Obsidian App instance
 * @param dirPath Path to the directory (will be normalized)
 */
export async function ensureDirectoryExists(app: App, dirPath: string): Promise<void> {
  const normalizedDirPath = normalizePath(dirPath);
  try {
    const dirExists = await app.vault.adapter.exists(normalizedDirPath);
    if (!dirExists) {
      await app.vault.createFolder(normalizedDirPath);
      console.log(`Created directory: ${normalizedDirPath}`);
    }
  } catch (err) {
    if (!err.message || !err.message.includes('already exists')) {
      console.error(`Could not ensure directory exists: ${normalizedDirPath}`, err);
      throw new Error(`Failed to ensure directory exists: ${normalizedDirPath}. ${err.message}`);
    }
    console.log(`Directory already exists (ignoring creation error): ${normalizedDirPath}`);
  }
}

/**
 * Finds a TFile by its normalized path, performing a case-insensitive comparison.
 * More reliable than getAbstractFileByPath across different filesystems and potential casing issues.
 *
 * @param app Obsidian App instance
 * @param normalizedPath The normalized path to search for (case will be ignored in comparison)
 * @returns The TFile if found, otherwise null.
 */
export function findFileCaseInsensitive(app: App, normalizedPath: string): TFile | null {
  const lowerCasePath = normalizedPath.toLowerCase();
  // Get all files (including non-markdown, just in case)
  const files = app.vault.getFiles();

  for (const file of files) {
    // Compare lowercased normalized paths
    if (file.path.toLowerCase() === lowerCasePath) {
      // Ensure it's actually a TFile instance before returning
      if (file instanceof TFile) {
        return file;
      } else {
        // Log if we found a match but it's not a TFile (e.g., TFolder)
        console.warn(`Path matched '${normalizedPath}' but it's not a TFile:`, file);
        return null; // Treat folders or other AbstractFile types as not found for this purpose
      }
    }
  }
  // No match found
  return null;
}

/**
 * Parses frontmatter from file content using the cache for positions.
 * @param content Full content of the file
 * @param cache MetadataCache FileCache for the file
 * @returns Object containing parsed data (or {} if none/error) and the body content.
 */
export function parseFrontmatter(content: string, cache: ReturnType<MetadataCache['getFileCache']>): { data: Record<string, any>, body: string } {
  let existingData: Record<string, any> = {};
  let bodyContent = content;

  if (cache?.frontmatter) {
    try {
      const frontmatterText = content.slice(cache.frontmatterPosition.start.offset + 3, cache.frontmatterPosition.end.offset - 3);
      existingData = (yaml.load(frontmatterText) as Record<string, any>) || {};
      bodyContent = content.slice(cache.frontmatterPosition.end.offset);
      if (bodyContent.length > 0 && !bodyContent.startsWith('\n')) {
        bodyContent = '\n' + bodyContent;
      }
    } catch (e) {
      console.warn(`Failed to parse existing YAML, treating as empty:`, e);
    }
  }
  return { data: existingData, body: bodyContent };
}

/**
 * Merges new data with existing data, respecting defaults.
 * Only updates fields if the new value is different from the default value.
 * Always updates 'last_modified'.
 *
 * @param existingData Data parsed from existing frontmatter.
 * @param newData Incoming data object (should include last_modified).
 * @param defaults An object defining default values for optional fields.
 * @returns The merged data object.
 */
export function mergeDataWithDefaults(
  existingData: Record<string, any>,
  newData: Record<string, any>,
  defaults: Record<string, any>
): Record<string, any> {
  let updatedData: Record<string, any> = { ...existingData };

  Object.keys(newData).forEach(key => {
    const valueKey = key as keyof typeof newData;
    const newValue = newData[valueKey];

    if (valueKey === 'last_modified') {
      updatedData[valueKey] = newValue;
      return;
    }

    if (Object.hasOwnProperty.call(defaults, valueKey)) {
      const defaultValue = defaults[valueKey];
      let isDefaultValue = false;
      if (Array.isArray(newValue) && Array.isArray(defaultValue)) {
        isDefaultValue = JSON.stringify(newValue) === JSON.stringify(defaultValue);
      } else {
        isDefaultValue = newValue === defaultValue;
      }
      if (!isDefaultValue) {
        updatedData[valueKey] = newValue;
      }
    } else {
      updatedData[valueKey] = newValue;
    }
  });

  if (!updatedData.last_modified && newData.last_modified) {
    updatedData.last_modified = newData.last_modified;
  }

  return updatedData;
}

/**
 * Filters out null and undefined values from an object, then generates a YAML frontmatter string.
 * @param data The data object to dump.
 * @returns YAML string including --- separators.
 */
export function generateYamlFrontmatter(data: Record<string, any>): string {
  const filteredData = Object.entries(data)
    .filter(([_, value]) => value !== null && typeof value !== 'undefined')
    .reduce((obj, [key, value]) => { obj[key] = value; return obj; }, {} as Record<string, any>);
  return '---\n' + yaml.dump(filteredData) + '---\n';
}

/**
 * Creates a new file and populates it with initial YAML frontmatter.
 * Assumes the directory structure might need creation.
 *
 * @param app Obsidian App instance
 * @param filePath Path for the new file (will be normalized)
 * @param initialData Data object for the initial frontmatter
 * @returns The newly created TFile object.
 */
export async function createFileWithFrontmatter(
  app: App,
  filePath: string,
  initialData: Record<string, any>
): Promise<TFile> {
  const normalizedFilePath = normalizePath(filePath);
  const parentDir = normalizedFilePath.substring(0, normalizedFilePath.lastIndexOf('/'));

  await ensureDirectoryExists(app, parentDir);

  const yamlSkeleton = generateYamlFrontmatter(initialData);

  try {
    const newFile = await app.vault.create(normalizedFilePath, yamlSkeleton);
    console.log(`Created file with frontmatter: ${normalizedFilePath}`);
    return newFile;
  } catch (err) {
    console.error(`Error creating file ${normalizedFilePath}:`, err);
    throw new Error(`Failed to create file: ${normalizedFilePath}. ${err.message}`);
  }
}

/**
 * Updates the frontmatter of an existing file, preserving the body content.
 *
 * @param app Obsidian App instance
 * @param file The TFile to update.
 * @param updatedData The complete data object for the new frontmatter.
 */
export async function updateFileFrontmatter(
  app: App,
  file: TFile,
  updatedData: Record<string, any>
): Promise<void> {
  try {
    const originalContent = await app.vault.read(file);
    const cache = app.metadataCache.getFileCache(file);

    const { body } = parseFrontmatter(originalContent, cache);
    const newYamlString = generateYamlFrontmatter(updatedData);

    const finalContent = newYamlString + (body.trim() === '' ? '\n' : body);

    await app.vault.modify(file, finalContent);
    console.log(`Updated frontmatter for: ${file.path}`);
  } catch (err) {
    console.error(`Error updating frontmatter for ${file.path}:`, err);
    throw new Error(`Failed to update frontmatter for ${file.path}. ${err.message}`);
  }
} 