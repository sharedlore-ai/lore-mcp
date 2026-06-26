import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

interface Hit {
  id: string;
  path: string;
  title: string;
  kind: string;
}

const QUERY = `query Search($projectId: ID!, $filters: NodeFilter!) {
  nodes(projectId: $projectId, filters: $filters, first: 50) {
    nodes { id path title kind }
  }
}`;

export function registerSearch(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_search",
    "Search nodes in a project by path substring (best-effort).",
    {
      query: z.string().describe("Substring to match against node paths."),
      kind: z
        .enum(["folder", "context", "adr", "log", "todo", "plan", "memory"])
        .optional()
        .describe("Optional kind filter."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ query, kind, project }) => {
      const projectId = await client.resolveProjectId(project);
      const filters: Record<string, unknown> = { pathICont: query, per: 50 };
      if (kind) filters.kindEq = kind;

      const data = await client.graphql<{ nodes: { nodes: (Hit | null)[] } }>(QUERY, {
        projectId,
        filters,
      });

      const hits = (data.nodes.nodes ?? []).filter((n): n is Hit => n !== null);
      if (hits.length === 0) {
        return { content: [{ type: "text", text: `No nodes matching "${query}".` }] };
      }

      const lines = hits.map((h) => `${h.path}  [${h.kind}]  ${h.title}  (id ${h.id})`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
