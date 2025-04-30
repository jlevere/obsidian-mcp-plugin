import {
  type App,
  TFile,
  TFolder,
  TAbstractFile,
  prepareFuzzySearch,
} from "obsidian";
import {
  FileMetadataObject,
  TreeNode,
  FileTreeNode,
  FolderTreeNode,
  TreeBuildOptions,
} from "./types";

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
