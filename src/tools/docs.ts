import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

const MUTATION = `mutation Upsert($input: UpsertNodeInput!) {
  upsertNode(input: $input) {
    node { id path kind title updatedAt }
  }
}`;

type Kind = "adr" | "log" | "todo" | "plan";

interface Spec {
  tool: string;
  kind: Kind;
  label: string;
}

const SPECS: Spec[] = [
  { tool: "lore_adr", kind: "adr", label: "Architecture Decision Record" },
  { tool: "lore_log", kind: "log", label: "log entry" },
  { tool: "lore_todo", kind: "todo", label: "TODO" },
  { tool: "lore_plan", kind: "plan", label: "plan" },
];

function registerOne(server: McpServer, client: LoreClient, spec: Spec): void {
  server.tool(
    spec.tool,
    `Create or update a ${spec.label} node by path (kind: ${spec.kind}).`,
    {
      path: z.string().describe(`Node path, e.g. bot/${spec.kind}/something.`),
      title: z.string().describe("Human-readable title."),
      body: z.string().describe("Markdown body of the document."),
      parentId: z.string().optional().describe("Optional parent node id."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ path, title, body, parentId, project }) => {
      const projectId = await client.resolveProjectId(project);
      const data = await client.graphql<{
        upsertNode: { node: { id: string; path: string; kind: string; title: string; updatedAt: string } };
      }>(MUTATION, {
        input: { projectId, path, kind: spec.kind, title, body, parentId },
      });

      const n = data.upsertNode.node;
      return {
        content: [
          {
            type: "text",
            text: `Saved ${spec.kind.toUpperCase()} "${n.title}" at ${n.path} (id ${n.id}).`,
          },
        ],
      };
    },
  );
}

export function registerDocs(server: McpServer, client: LoreClient): void {
  for (const spec of SPECS) registerOne(server, client, spec);
}
