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
Updates a machine file given a schema and file name. Creates the file if it doesn't exist.
Uses the Machine Schema. It merges new non-default data into existing frontmatter.
`;

// Define defaults for Machine schema
const MACHINE_DEFAULTS: Record<string, string | boolean | any[]> = {
  machine_id: "unknown",
  hostname: "unknown",
  ip_address: "unknown",
  os: "unknown",
  vulnerabilities: [],
  services: [],
  interesting_software: [],
  edr_running: false,
  edr_name: "unknown",
};

export function registerUpdateMachineHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "update-machine",
    description,
    {
      // Schema definition using defaults
      client: z.string().describe("The client to use for the machine"),
      domain: z.string().describe("The domain to use for the machine"),
      machine_name: z.string().describe("The name of the machine (e.g. 'server1')"),
      machine_id: z.string().optional().default(MACHINE_DEFAULTS.machine_id as string).describe("Unique identifier for the machine (e.g., `machine_server1`)"),
      hostname: z.string().optional().default(MACHINE_DEFAULTS.hostname as string).describe("The hostname of the machine (e.g., `server1.clienta.local`)"),
      ip_address: z.string().optional().default(MACHINE_DEFAULTS.ip_address as string).describe("The IP address of the machine (e.g., `192.168.1.10`)"),
      os: z.string().optional().default(MACHINE_DEFAULTS.os as string).describe("Operating system details (e.g., `Windows Server 2019`)"),
      vulnerabilities: z
        .array(
          z.object({
            id: z.string().describe("Example: `VULN-001`"),
            description: z.string().describe("Description of the vulnerability."),
            severity: z.string().describe("Severity rating (e.g., low, medium, high)."),
          })
        )
        .optional()
        .default(MACHINE_DEFAULTS.vulnerabilities as any[]) // Assuming complex objects in array
        .describe("A list of vulnerability objects."),
      services: z
        .array(
          z.object({
            name: z.string().describe("Example: `SMB`"),
            port: z.number().describe("Example: `445`"),
          })
        )
        .optional()
        .default(MACHINE_DEFAULTS.services as any[]) // Assuming complex objects in array
        .describe("A list of service objects provided by the machine."),
      interesting_software: z
        .array(
          z.object({
            name: z.string().describe("Name of the software."),
            notes: z.string().describe("Explanation of why the software is interesting, file location, etc."),
          })
        )
        .optional()
        .default(MACHINE_DEFAULTS.interesting_software as any[]) // Assuming complex objects in array
        .describe("A list of software objects deemed interesting (e.g., potential privilege escalation vectors)."),
      edr_running: z
        .boolean()
        .optional()
        .default(MACHINE_DEFAULTS.edr_running as boolean)
        .describe("Indicates whether an EDR (Endpoint Detection and Response) is running."),
      edr_name: z
        .string()
        .optional()
        .default(MACHINE_DEFAULTS.edr_name as string)
        .describe('The name of the EDR, or "unknown" if not applicable.'),
    },
    async (inputArgs) => {
      const { client, domain, machine_name, ...machineDataInput } = inputArgs;

      const targetPath = normalizePath(`Clients/${client}/Domains/${domain}/Machines/${machine_name}.md`);

      // Construct the full data object including last_modified
      const machineData = {
        ...machineDataInput, // Contains all optional fields with defaults applied by Zod
        last_modified: new Date().toISOString(),
      };

      try {
        let file = app.vault.getAbstractFileByPath(targetPath);

        // --- Create or Update --- 
        if (!file) {
          // Create file with initial data
          await createFileWithFrontmatter(app, targetPath, machineData);
          return { content: [{ type: "text", text: `Machine file created: ${targetPath}` }] };
        } else {
          // Check if it's a folder
          if (!(file instanceof TFile)) {
            return {
              content: [{ type: "text", text: `Provided path is a folder, not a machine file: ${targetPath}` }],
              isError: true,
            };
          }

          // Update existing file
          const originalContent = await app.vault.read(file);
          const cache = app.metadataCache.getFileCache(file);
          const { data: existingData } = parseFrontmatter(originalContent, cache);

          const mergedData = mergeDataWithDefaults(existingData, machineData, MACHINE_DEFAULTS);

          await updateFileFrontmatter(app, file, mergedData);

          return { content: [{ type: "text", text: `Machine file updated: ${targetPath}` }] };
        }
      } catch (err) {
        console.error(`Error processing machine file ${targetPath}:`, err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error processing machine file: ${errorMessage}` }],
          isError: true,
        };
      }
    }
  );
}