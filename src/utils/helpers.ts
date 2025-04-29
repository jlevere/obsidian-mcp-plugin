import { type App, TFile, prepareFuzzySearch } from "obsidian";
import { FileMetadataObject } from "./types";

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
