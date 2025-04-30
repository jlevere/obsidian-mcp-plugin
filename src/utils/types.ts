import { App, FileStats } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface ToolConfig {
  enabled: boolean;
  description: string;
  type: "static" | "dynamic" | "resource";
}

export interface ObsidianMcpSettings {
  port: number;
  bindingHost: string;
  disabledTools: string[];
  enableDynamicTools: boolean;
  dynamicToolsPath: string;
}

export interface ServerConfig {
  port: number;
  bindingHost: string;
}

export interface ToolRegistration {
  name: string;
  description: string;
  type: "static" | "dynamic" | "resource";
  register: (app: any, mcpServer: any) => void;
}

export interface FileMetadataObject {
  tags: string[];
  frontmatter: Record<string, unknown>;
  stat: FileStats;
  path: string;
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

type ToolRegistrationFn = (app: App, mcpServer: McpServer) => void;

export interface ToolRegistry {
  readonly [key: string]: ToolRegistrationFn;
}

export interface BaseTreeNode {
  name: string;
  type: "file" | "folder";
  path: string;
}

export interface FileTreeNode extends BaseTreeNode {
  type: "file";
  size: number;
  modified: number;
  tags?: string[];
  frontmatter?: Record<string, unknown>;
}

export interface FolderTreeNode extends BaseTreeNode {
  type: "folder";
  children: TreeNode[];
}

export type TreeNode = FileTreeNode | FolderTreeNode;

export interface TreeBuildOptions {
  includeMetadata?: boolean;
  maxDepth?: number;
}
