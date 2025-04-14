import { App, TFile } from "obsidian";
import { FileMetadataObject } from "./types";

export async function getFileMetadataObject(
  app: App,
  file: TFile
): Promise<FileMetadataObject> {
  const content = await app.vault.read(file);
  const cache = app.metadataCache.getFileCache(file);
  const tags = cache?.tags?.map((tag) => tag.tag) || [];
  const frontmatter = cache?.frontmatter || {};

  return {
    tags,
    frontmatter,
    stat: file.stat,
    path: file.path,
    content,
  };
}
