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
Updates a client description file given a schema and identifiers. Creates the file if it doesn't exist.
Uses the Client Schema. It merges new non-default data into existing frontmatter.

Client Schema Fields:
- client_id (string, identifier)
- name (string)
- description (string, optional)
- engagement_start (string, ISO8601)
- engagement_end (string, ISO8601)
- contacts (list of objects, optional, default: [])
- last_modified (string, ISO8601, auto-updated)
`;

// Define defaults for Client schema
const CLIENT_DEFAULTS: Record<string, string | boolean | any[]> = {
  description: "No description provided",
  contacts: [],
};

// Define the structure for a contact within the Zod schema
const contactSchema = z.object({
  name: z.string().describe("Name of the contact person (e.g., `John Doe`)"),
  role: z.string().optional().default("Unknown Role").describe("Role or title of the contact (e.g., `Project Lead`)"),
  email: z.string().optional().default("unknown@example.com").describe("Contact email address (e.g., `johndoe@clienta.com`)"),
});

export function registerUpdateClientHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "update-client",
    description,
    {
      // Schema definition for Client
      client_id: z.string().describe("Unique identifier for the client (e.g., `Client_A`)"),
      name: z.string().describe("The human-readable name of the client or engagement (e.g., `Client A - Red Team Engagement`)"),
      description: z.string().optional().default(CLIENT_DEFAULTS.description as string).describe("A brief description of the engagement or client details."),
      engagement_start: z.preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().datetime({ message: "Invalid ISO8601 datetime string for start date" }).optional().default(new Date().toISOString())
      ).describe("Timestamp for the start of the engagement (e.g., `2025-03-20T09:00:00Z`)"),
      engagement_end: z.preprocess(
        (val) => (val === "" ? undefined : val),
        z.string().datetime({ message: "Invalid ISO8601 datetime string for end date" }).optional().default(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString())
      ).describe("Timestamp for the end of the engagement (e.g., `2025-04-05T17:00:00Z`)"),
      contacts: z.array(contactSchema).optional().default(CLIENT_DEFAULTS.contacts as any[]).describe("A list of contact objects."),
    },
    async (inputArgs) => {
      const { client_id, ...clientDataInput } = inputArgs;

      const targetPath = normalizePath(`Clients/${client_id}.md`);

      const clientData = {
        ...clientDataInput,
        client_id,
        last_modified: new Date().toISOString(),
      };

      try {
        let file = app.vault.getAbstractFileByPath(targetPath);

        // --- Create or Update --- 
        if (!file) {
          await createFileWithFrontmatter(app, targetPath, clientData);
          return { content: [{ type: "text", text: `Client file created: ${targetPath}` }] };
        } else {
          if (!(file instanceof TFile)) {
            return {
              content: [{ type: "text", text: `Provided path is a folder, not a client file: ${targetPath}` }],
              isError: true,
            };
          }

          const originalContent = await app.vault.read(file);
          const cache = app.metadataCache.getFileCache(file);
          const { data: existingData } = parseFrontmatter(originalContent, cache);

          const mergedData = mergeDataWithDefaults(existingData, clientData, CLIENT_DEFAULTS);

          await updateFileFrontmatter(app, file, mergedData);

          return { content: [{ type: "text", text: `Client file updated: ${targetPath}` }] };
        }
      } catch (err) {
        console.error(`Error processing client file ${targetPath}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error processing client file: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
} 