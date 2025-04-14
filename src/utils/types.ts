import { TFile, CachedMetadata, FileStats } from "obsidian";

export interface ObsidianMcpSettings {
  port: number;
  bindingHost: string;
}

export interface FileMetadataObject {
  tags: string[];
  frontmatter: Record<string, unknown>;
  stat: FileStats;
  path: string;
  content: string;
}

export interface SearchContext {
  match: {
    start: number;
    end: number;
  };
  context: string;
}

export interface SearchResponseItem {
  filename: string;
  score?: number;
  matches: SearchContext[];
}

export interface HeadingBoundary {
  start: { line: number; col: number };
  end?: { line: number; col: number };
}
