import { App, prepareFuzzySearch } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SearchResponseItem } from "@types";
import { getErrorMessage } from "utils/helpers";

export const description = `
Performs a fuzzy search across all file names in the vault.

The search query can be a partial match and will return files whose names best match the query.
Results are sorted by relevance.

Returns:
- files: Array of matching file paths
`;

export function registerSearchFilenamesHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian-mcp-search-filenames",
    description,
    {
      query: z.string().describe("Search query for vault filenames"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
    },
    ({ query, limit }) => {
      try {
        const search = prepareFuzzySearch(query);
        const results: SearchResponseItem[] = [];

        for (const file of app.vault.getMarkdownFiles()) {
          const result = search(file.path);

          if (result) {
            results.push({
              filename: file.path,
              score: result.score,
              matches: [],
            });
          }
        }

        results.sort((a, b) => b.score - a.score);
        const limitedResults = results.slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: limitedResults
                .map(
                  (item) =>
                    `Match\n\tfilename='${item.filename}', \n\tScore=${item.score ?? 0
                    }`
                )
                .join("\n"),
            },
          ],
        };
      } catch (error: unknown) {
        return {
          content: [
            {
              type: "text",
              text: `Error processing fuzzy search: ${getErrorMessage(error)}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
