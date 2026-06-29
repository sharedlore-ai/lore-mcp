import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

const QUERY = `query Context($projectId: ID!, $path: String!) {
  nodeByPath(projectId: $projectId, path: $path) {
    id path title kind body updatedAt
  }
}`;

const WRITE = `mutation UpsertContext($input: UpsertNodeInput!) {
  upsertNode(input: $input) {
    node { id path title kind updatedAt }
  }
}`;

// Default a title from a context path: the area segment, not the trailing
// "context" leaf (e.g. "mcp/context" -> "Mcp", "context" -> "Overview").
function titleFromPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  const leaf = segments[segments.length - 1];
  const area = leaf === "context" ? segments[segments.length - 2] : leaf;
  if (!area) return "Overview";
  return area.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function registerContext(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_context",
    "Read or write an area's context document (a context-kind node). Omit `body` to FETCH the context at a path. Pass `body` to WRITE it directly as authored content - this is an authored doc, it does NOT run synthesis. Use this for importing/editing hand-written context.md files; the capture flow is what derives context from sessions.",
    {
      path: z.string().describe("Node path, e.g. mcp/context (area context) or context (project overview)."),
      title: z.string().optional().describe("Title when writing. Defaults to the area name derived from the path."),
      body: z.string().optional().describe("When provided, writes this Markdown as the context node body (authored, no synthesis). When omitted, the tool reads instead."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ path, title, body, project }) => {
      const projectId = await client.resolveProjectId(project);

      if (body !== undefined) {
        const data = await client.graphql<{
          upsertNode: { node: { id: string; path: string; title: string; kind: string; updatedAt: string } };
        }>(WRITE, {
          input: { projectId, path, kind: "context", title: title ?? titleFromPath(path), body },
        });
        const n = data.upsertNode.node;
        return {
          content: [{ type: "text", text: `Wrote context "${n.title}" at ${n.path} (id ${n.id}, authored - no synthesis).` }],
        };
      }

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
      const renderedBody = node.body?.trim() || "(empty)";
      return { content: [{ type: "text", text: `${header}\n\n${renderedBody}` }] };
    },
  );
}
