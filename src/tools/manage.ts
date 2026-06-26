import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

const DELETE = `mutation Delete($input: DeleteNodeInput!) {
  deleteNode(input: $input) { id }
}`;

const MOVE = `mutation Move($input: MoveNodeInput!) {
  moveNode(input: $input) { node { id path title kind } }
}`;

export function registerManage(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_delete",
    "Delete a node (and its children) by path or id. Irreversible — use to clean up mistaken or stale nodes.",
    {
      node: z.string().describe("Node path (e.g. bot/exits) or id to delete."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ node, project }) => {
      const projectId = await client.resolveProjectId(project);
      const id = await client.resolveNodeId(projectId, node);

      await client.graphql<{ deleteNode: { id: string } }>(DELETE, { input: { id } });

      return {
        content: [{ type: "text", text: `Deleted node ${id} (${node}) and any children.` }],
      };
    },
  );

  server.tool(
    "lore_move",
    "Move or rename a node to a new path (and optionally a new parent), by path or id. Cascades child paths.",
    {
      node: z.string().describe("Current node path or id."),
      path: z.string().describe("New full path for the node (e.g. bot/exits/v2)."),
      parentId: z.string().optional().describe("Optional new parent node id."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ node, path, parentId, project }) => {
      const projectId = await client.resolveProjectId(project);
      const id = await client.resolveNodeId(projectId, node);

      const data = await client.graphql<{
        moveNode: { node: { id: string; path: string; title: string } };
      }>(MOVE, { input: { id, path, parentId } });

      const n = data.moveNode.node;
      return {
        content: [{ type: "text", text: `Moved node ${id} to ${n.path} ("${n.title}").` }],
      };
    },
  );
}
