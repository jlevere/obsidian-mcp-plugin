import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createFileWithFrontmatter,
  mergeDataWithDefaults,
  parseFrontmatter,
  updateFileFrontmatter
} from "../utils/obsidian-crud-utils";


const description = `
Updates a domain description file given a schema and identifiers. Creates the file if it doesn't exist.
Uses the Domain Schema. It merges new non-default data into existing frontmatter.

Domain Schema Fields:
- client (string, for path)
- domain_id (string, identifier, used for path)
- name (string)
- description (string, optional)
- scope (string, optional)
- discovery_date (string, ISO8601, optional)
- last_modified (string, ISO8601, auto-updated)
`;

const DOMAIN_DEFAULTS: Record<string, string | boolean | any[]> = {
  description: "No description provided",
  scope: "No scope provided",
  discovery_date: new Date(0).toISOString(),
};

export function registerUpdateDomainHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "update-domain",
    description,
    {
      client: z.string().describe("The client associated with this domain"),
      domain_id: z.string().describe("Unique identifier for the domain (e.g., `CORP.LOCAL`, used in path)"),
      name: z.string().describe("Name of the domain (e.g., `CORP.LOCAL`)"),
      description: z.string().optional().default(DOMAIN_DEFAULTS.description as string).describe("Brief description of the domain and its scope."),
      scope: z.string().optional().default(DOMAIN_DEFAULTS.scope as string).describe("Detailed description of the systems or networks covered."),
      discovery_date: z.preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().datetime({ message: "Invalid ISO8601 datetime string for discovery date" }).optional().default(DOMAIN_DEFAULTS.discovery_date as string)
      ).describe("Timestamp for when the domain was discovered (e.g., `2025-03-22T10:00:00Z`)"),
    },
    async (inputArgs) => {
      const { client, domain_id, ...domainDataInput } = inputArgs;

      const targetPath = normalizePath(`Clients/${client}/Domains/${domain_id}/${domain_id}.md`);

      const domainData = {
        ...domainDataInput,
        domain_id,
        last_modified: new Date().toISOString(),
      };

      try {
        let file = app.vault.getAbstractFileByPath(targetPath);

        // --- Create or Update --- 
        if (!file) {
          await createFileWithFrontmatter(app, targetPath, domainData);
          return { content: [{ type: "text", text: `Domain file created: ${targetPath}` }] };
        } else {
          if (!(file instanceof TFile)) {
            return {
              content: [{ type: "text", text: `Provided path is a folder, not a domain file: ${targetPath}` }],
              isError: true,
            };
          }

          const originalContent = await app.vault.read(file);
          const cache = app.metadataCache.getFileCache(file);
          const { data: existingData } = parseFrontmatter(originalContent, cache);

          const mergedData = mergeDataWithDefaults(existingData, domainData, DOMAIN_DEFAULTS);

          await updateFileFrontmatter(app, file, mergedData);

          return { content: [{ type: "text", text: `Domain file updated: ${targetPath}` }] };
        }
      } catch (err) {
        console.error(`Error processing domain file ${targetPath}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error processing domain file: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
} 