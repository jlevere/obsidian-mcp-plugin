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
Updates a user file given a schema and identifiers. Creates the file if it doesn't exist.
Uses the User Schema. It merges new non-default data into existing frontmatter.

User Schema Fields:
- user_id (string, identifier)
- name (string)
- role (string)
- permissions (list of strings, optional, default: [])
- email (string)
- last_modified (string, ISO8601, auto-updated)
`;

// Define defaults here for clarity and reuse
const USER_DEFAULTS: Record<string, string | boolean | any[]> = {
  name: "unknown",
  role: "unknown",
  permissions: [],
  email: "unknown",
};

export function registerUpdateUserHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "update-user",
    description,
    {
      client: z.string().describe("The client associated with the user"),
      domain: z.string().describe("The domain associated with the user"),
      user_id: z.string().describe("Unique identifier for the user (e.g., `user_jdoe`)"),
      name: z.string().optional().default(USER_DEFAULTS.name as string).describe("Full name of the user (e.g., `John Doe`)"),
      role: z.string().default(USER_DEFAULTS.role as string).describe("The role or position of the user (e.g., `Administrator`)"),
      permissions: z.array(z.string()).optional().default(USER_DEFAULTS.permissions as string[]).describe("An array of permissions (e.g., [\"read\", \"write\", \"execute\"])"),
      email: z.string().optional().default(USER_DEFAULTS.email as string).describe("User's email address (e.g., `jdoe@clienta.com`)"),
    },
    async (inputArgs) => {
      const { client, domain, user_id, ...userDataInput } = inputArgs;

      const targetPath = normalizePath(`Clients/${client}/Domains/${domain}/Users/${user_id}.md`);

      // Construct the full data object including last_modified
      const userData = {
        ...userDataInput,
        user_id,
        last_modified: new Date().toISOString(),
      };

      try {
        let file = app.vault.getAbstractFileByPath(targetPath);

        // --- Create or Update --- 
        if (!file) {
          await createFileWithFrontmatter(app, targetPath, userData);
          return { content: [{ type: "text", text: `User file created: ${targetPath}` }] };
        } else {
          if (!(file instanceof TFile)) {
            return {
              content: [{ type: "text", text: `Provided path is a folder, not a user file: ${targetPath}` }],
              isError: true,
            };
          }

          const originalContent = await app.vault.read(file);
          const cache = app.metadataCache.getFileCache(file);
          const { data: existingData } = parseFrontmatter(originalContent, cache);

          const mergedData = mergeDataWithDefaults(existingData, userData, USER_DEFAULTS);

          await updateFileFrontmatter(app, file, mergedData);

          return { content: [{ type: "text", text: `User file updated: ${targetPath}` }] };
        }
      } catch (err) {
        console.error(`Error processing user file ${targetPath}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error processing user file: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
} 