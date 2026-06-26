import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

interface TreeNode {
  id: string;
  path: string;
  title: string;
  kind: string;
}

const QUERY = `query Tree($projectId: ID!, $parentId: ID, $kind: String) {
  nodes(projectId: $projectId, parentId: $parentId, kind: $kind, first: 200) {
    nodes { id path title kind }
  }
}`;

export function registerTree(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_tree",
    "List the folder/doc tree for a project. Optionally scope by parent node or kind.",
    {
      parentId: z.string().optional().describe("List only children of this node id."),
      kind: z
        .enum(["folder", "context", "adr", "log", "todo", "plan", "memory"])
        .optional()
        .describe("Filter by node kind."),
      project: z.string().optional().describe("Project slug (defaults to LORE_PROJECT)."),
    },
    async ({ parentId, kind, project }) => {
      const projectId = await client.resolveProjectId(project);
      const data = await client.graphql<{ nodes: { nodes: (TreeNode | null)[] } }>(QUERY, {
        projectId,
        parentId,
        kind,
      });

      const nodes = (data.nodes.nodes ?? []).filter((n): n is TreeNode => n !== null);
      if (nodes.length === 0) {
        return { content: [{ type: "text", text: "(no nodes)" }] };
      }

      const sorted = [...nodes].sort((a, b) => a.path.localeCompare(b.path));
      const lines = sorted.map((n) => `${n.path}  [${n.kind}]  ${n.title}  (id ${n.id})`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
