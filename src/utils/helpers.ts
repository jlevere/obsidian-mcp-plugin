import {
  type App,
  TFile,
  TFolder,
  TAbstractFile,
  prepareFuzzySearch,
  normalizePath,
} from "obsidian";
import {
  FileMetadataObject,
  TreeNode,
  FileTreeNode,
  FolderTreeNode,
  TreeBuildOptions,
} from "@types";

export async function getFileMetadataObject(
  app: App,
  file: TFile
): Promise<FileMetadataObject> {
  const cache = app.metadataCache.getFileCache(file);
  const tags = cache?.tags?.map((tag) => tag.tag) || [];
  const frontmatter = cache?.frontmatter || {};

  return {
    tags,
    frontmatter,
    stat: file.stat,
    path: file.path,
  };
}

/**
 * Find the most similar file paths to the target path
 */
export function findSimilarFiles(
  app: App,
  targetPath: string,
  limit = 3
): { path: string; score: number }[] {
  const search = prepareFuzzySearch(targetPath);
  const results: { path: string; score: number }[] = [];

  // Search through all files
  for (const file of app.vault.getFiles()) {
    const result = search(file.path);
    if (result) {
      results.push({
        path: file.path,
        score: result.score,
      });
    }
  }

  // Sort by score (higher is better) and take top matches
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Builds a tree structure from a file or folder
 * @param app Obsidian App instance
 * @param file The file or folder to build the tree from
 * @param options Tree building options
 * @returns Promise<TreeNode>
 */
export async function buildVaultTree(
  app: App,
  file: TAbstractFile,
  options: TreeBuildOptions = {}
): Promise<TreeNode | null> {
  const { includeMetadata = false, maxDepth = Infinity } = options;
  const currentDepth = maxDepth;

  if (file instanceof TFile) {
    const baseNode: FileTreeNode = {
      name: file.name,
      type: "file",
      path: file.path,
      size: file.stat.size,
      modified: file.stat.mtime,
    };

    if (includeMetadata) {
      const metadata = await getFileMetadataObject(app, file);
      return {
        ...baseNode,
        tags: metadata.tags,
        frontmatter: metadata.frontmatter,
      };
    }

    return baseNode;
  }

  if (file instanceof TFolder) {
    const node: FolderTreeNode = {
      name: file.name,
      type: "folder",
      path: file.path,
      children: [],
    };

    if (currentDepth > 0) {
      node.children = await Promise.all(
        file.children.map((child) =>
          buildVaultTree(app, child, {
            ...options,
            maxDepth: currentDepth - 1,
          })
        )
      );
      // Filter out null values and assert type
      node.children = node.children.filter(
        (child): child is TreeNode => child !== null
      );
    }

    return node;
  }

  return null;
}

// Rollback store for file content before edits
export interface RollbackEntry {
  content: string;
  timestamp: number;
  reason: string;
}

export const rollbackStore: Record<string, RollbackEntry> = {};

/**
 * Save the current content of a file to the rollback store before modification.
 */
export async function saveRollback(app: App, path: string, reason: string) {
  const normPath = normalizePath(path);
  const file = app.vault.getAbstractFileByPath(normPath);
  if (file && file instanceof TFile) {
    const content = await app.vault.read(file);
    rollbackStore[normPath] = {
      content,
      timestamp: Date.now(),
      reason,
    };
  }
}

/**
 * Restore a file's content from the rollback store, if available.
 */
export async function restoreRollback(
  app: App,
  path: string
): Promise<{ success: boolean; message: string }> {
  const normPath = normalizePath(path);
  const entry = rollbackStore[normPath];
  if (!entry) {
    return { success: false, message: "No rollback available for this file." };
  }
  const file = app.vault.getAbstractFileByPath(normPath);
  if (!file || !(file instanceof TFile)) {
    return { success: false, message: "File not found for rollback." };
  }
  await app.vault.modify(file, entry.content);
  const msg = `Rollback successful. Timestamp: ${new Date(
    entry.timestamp
  ).toISOString()}, Reason: ${entry.reason}`;
  delete rollbackStore[normPath];
  return { success: true, message: msg };
}

/**
 * Returns a suggestion string for similar files if the requested file is not found.
 * @param app Obsidian App instance
 * @param normPath Normalized path of the file being searched for
 * @returns Suggestion string (may be empty)
 */
export function getSimilarFilesSuggestion(app: App, normPath: string): string {
  const similarFiles = findSimilarFiles(app, normPath);
  if (similarFiles.length > 0) {
    return `\n\nDid you mean:\n${similarFiles
      .map((f) => `- ${f.path}`)
      .join("\n")}`;
  }
  return "";
}
