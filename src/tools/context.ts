import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

const QUERY = `query Context($projectId: ID!, $path: String!) {
  nodeByPath(projectId: $projectId, path: $path) {
    id path title kind body updatedAt
  }
}`;

export function registerContext(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_context",
    "Fetch the derived area context document at a path (a context-kind node).",
    {
      path: z.string().describe("Node path, e.g. bot/exits."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ path, project }) => {
      const projectId = await client.resolveProjectId(project);
      const data = await client.graphql<{
        nodeByPath: {
          id: string;
          path: string;
          title: string;
          kind: string;
          body: string | null;
          updatedAt: string;
        } | null;
      }>(QUERY, { projectId, path });

      const node = data.nodeByPath;
      if (!node) {
        return { content: [{ type: "text", text: `No node at "${path}".` }] };
      }

      const header = `# ${node.title}  [${node.path}] (${node.kind}, updated ${node.updatedAt.slice(0, 10)})`;
      const body = node.body?.trim() || "(empty)";
      return { content: [{ type: "text", text: `${header}\n\n${body}` }] };
    },
  );
}
