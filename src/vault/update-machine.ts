import { App, TFile, normalizePath } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SearchResponseItem } from "src/utils/types";
import yaml from "js-yaml";

const description = `
Updates a machine file given a schema and file name.

Schema:
`;

export function registerUpdateMachineHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "update-machine",
    description,
    {
      client: z.string().describe("The client to use for the machine"),
      domain: z.string().describe("The domain to use for the machine"),
      machine_name: z.string().describe("The name of the machine (e.g. 'server1')"),
      machine_id: z.string().optional().default("unknown").describe("Unique identifier for the machine (e.g., `machine_server1`)"),
      hostname: z.string().optional().default("unknown").describe("The hostname of the machine (e.g., `server1.clienta.local`)"),
      ip_address: z.string().optional().default("unknown").describe("The IP address of the machine (e.g., `192.168.1.10`)"),
      os: z.string().optional().default("unknown").describe("Operating system details (e.g., `Windows Server 2019`)"),
      vulnerabilities: z
        .array(
          z.object({
            id: z.string().describe("Example: `VULN-001`"),
            description: z.string().describe("Description of the vulnerability."),
            severity: z
              .string()
              .describe("Severity rating (e.g., low, medium, high)."),
          })
        )
        .optional()
        .default([])
        .describe("A list of vulnerability objects."),
      services: z
        .array(
          z.object({
            name: z.string().describe("Example: `SMB`"),
            port: z.number().describe("Example: `445`"),
          })
        )
        .optional()
        .default([])
        .describe("A list of service objects provided by the machine."),
      interesting_software: z
        .array(
          z.object({
            name: z.string().describe("Name of the software."),
            notes: z
              .string()
              .describe(
                "Explanation of why the software is interesting, file location, etc."
              ),
          })
        )
        .optional()
        .default([])
        .describe(
          "A list of software objects deemed interesting (e.g., potential privilege escalation vectors)."
        ),
      edr_running: z
        .boolean()
        .optional()
        .default(false)
        .describe("Indicates whether an EDR (Endpoint Detection and Response) is running."),
      edr_name: z
        .string()
        .optional()
        .default("unknown")
        .describe('The name of the EDR, or "unknown" if not applicable.'),
    },
    async ({
      client,
      domain,
      machine_name,
      machine_id,
      hostname,
      ip_address,
      os,
      vulnerabilities,
      services,
      interesting_software,
      edr_running,
      edr_name,
    }) => {
      const targetPath = normalizePath(`Clients/${client}/Domains/${domain}/Machines/${machine_name}.md`);
      let file = app.vault.getAbstractFileByPath(targetPath);

      const machineData = {
        machine_id,
        hostname,
        ip_address,
        os,
        vulnerabilities,
        services,
        interesting_software,
        edr_running,
        edr_name,
        last_modified: new Date().toISOString(),
      };

      // File doesn't exist, create it
      if (!file) {
        try {
          const machineDir = normalizePath(`Clients/${client}/Domains/${domain}/Machines`);
          const dirExists = await app.vault.adapter.exists(machineDir);
          if (!dirExists) {
            await app.vault.createFolder(machineDir);
          }
          const newFile = await app.vault.create(targetPath, "");
          file = newFile;
          const yamlSkeleton = '---\n' + yaml.dump(machineData) + '---\n';
          await app.vault.modify(file as TFile, yamlSkeleton);
        } catch (err) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating file: ${err.message}`,
              },
            ],
            isError: true,
          };
        }
      }

      // File is a folder
      if (!(file instanceof TFile)) {
        return {
          content: [
            { type: "text", text: `Provided path is a folder: ${targetPath}` },
          ],
          isError: true,
        };
      }

      // --- File Update Logic --- 
      try {
        // Read existing content
        const originalContent = await app.vault.read(file);
        const cache = app.metadataCache.getFileCache(file);

        let existingData: Record<string, any> = {};
        let bodyContent = originalContent;

        // Try parsing existing frontmatter
        if (cache?.frontmatter) {
          try {
            const frontmatterText = originalContent.slice(cache.frontmatterPosition.start.offset + 3, cache.frontmatterPosition.end.offset - 3);
            existingData = yaml.load(frontmatterText) as Record<string, any> || {};
            bodyContent = originalContent.slice(cache.frontmatterPosition.end.offset);
            // Ensure body starts with newline if it exists
            if (bodyContent.length > 0 && !bodyContent.startsWith('\n')) {
              bodyContent = '\n' + bodyContent;
            }
          } catch (e) {
            console.warn(`Failed to parse existing YAML for ${targetPath}, treating as empty:`, e);
            // Keep existingData = {}, bodyContent = originalContent
          }
        }

        // Define defaults for comparison
        const defaults: Record<string, string | boolean | any[]> = {
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

        // Merge data: Update existingData only if new value is not the default
        let updatedData: Record<string, any> = { ...existingData };
        // Use Object.keys for type safety with keys
        Object.keys(machineData).forEach(key => {
          // Type assertion for key access
          const valueKey = key as keyof typeof machineData;
          const newValue = machineData[valueKey];

          // Always update last_modified
          if (valueKey === 'last_modified') {
            updatedData[valueKey] = newValue;
            return; // Use return instead of continue in forEach
          }

          if (Object.hasOwnProperty.call(defaults, valueKey)) {
            const defaultValue = defaults[valueKey];
            let isDefaultValue = false;
            if (Array.isArray(newValue) && Array.isArray(defaultValue)) {
              isDefaultValue = JSON.stringify(newValue) === JSON.stringify(defaultValue);
            } else {
              isDefaultValue = newValue === defaultValue;
            }

            if (!isDefaultValue) {
              updatedData[valueKey] = newValue;
            }
          } else {
            updatedData[valueKey] = newValue;
          }
        });

        // Ensure last_modified is present
        if (!updatedData.last_modified) {
          updatedData.last_modified = machineData.last_modified;
        }

        // Generate new YAML (filter null/undefined)
        const filteredUpdatedData = Object.entries(updatedData)
          .filter(([_, value]) => value !== null && typeof value !== 'undefined')
          .reduce((obj, [key, value]) => { obj[key] = value; return obj; }, {} as Record<string, any>);
        const newYamlString = '---\n' + yaml.dump(filteredUpdatedData) + '---\n';

        // Reconstruct and write file content
        const finalContent = newYamlString + (bodyContent.trim() === '' ? '\n' : bodyContent);
        await app.vault.modify(file, finalContent);

        return { content: [{ type: "text", text: `File updated: ${targetPath}` }] };

      } catch (err) {
        console.error(`Error updating file ${targetPath}:`, err);
        return { content: [{ type: "text", text: `Error updating file: ${err.message}` }], isError: true };
      }
      // --- End File Update Logic ---

    }
  );
}