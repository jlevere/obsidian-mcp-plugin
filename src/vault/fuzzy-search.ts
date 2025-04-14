import { App, prepareFuzzySearch } from "obsidian";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SearchResponseItem } from "src/utils/types";

export function registerFuzzySearchHandler(app: App, mcpServer: McpServer) {
  mcpServer.tool(
    "obsidian/vault/fuzzy-search",
    {
      query: z.string().describe("Search query for vault"),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe("Maximum number of results to return"),
    },
    async ({ query, limit }) => {
      try {
        const search = prepareFuzzySearch(query);
        const results: SearchResponseItem[] = [];

        for (const file of app.vault.getMarkdownFiles()) {
          const cachedContents = await app.vault.cachedRead(file);
          const result = search(cachedContents);

          if (result) {
            results.push({
              filename: file.path,
              score: result.score,
              matches: [],
            });
          }
        }

        results.sort((a, b) => a.score - b.score);
        const limitedResults = results.slice(0, limit);

        return {
          content: [
            {
              type: "text",
              text: limitedResults
                .map(
                  (item) =>
                    `Match\n\tfilename='${item.filename}', \n\tScore=${
                      item.score ?? 0
                    }`
                )
                .join("\n"),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error processing fuzzy search: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
