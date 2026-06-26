import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

const MUTATION = `mutation Capture($input: CaptureSessionInput!) {
  captureSession(input: $input) {
    session {
      id
      capturedAt
      node { path title }
    }
  }
}`;

export function registerCapture(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_capture",
    "Append a session capture to an area by path or id. Creates the area node (a folder) if it does not exist yet, so a brand-new/empty project bootstraps on first capture. Append-only; triggers server-side context synthesis.",
    {
      node: z.string().describe("Area path (e.g. bot/exits) or node id. Created as a folder if it doesn't exist."),
      body: z.string().describe("The full capture body — what happened, decisions, findings."),
      summary: z.string().optional().describe("Optional one-line summary."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ node, body, summary, project }) => {
      const projectId = await client.resolveProjectId(project);
      const nodeId = await client.resolveOrCreateNodeId(projectId, node);

      const data = await client.graphql<{
        captureSession: {
          session: { id: string; capturedAt: string; node: { path: string; title: string } | null };
        };
      }>(MUTATION, { input: { projectId, nodeId, body, summary } });

      const s = data.captureSession.session;
      const where = s.node ? `${s.node.title} [${s.node.path}]` : `node ${nodeId}`;
      return {
        content: [
          {
            type: "text",
            text: `Captured session ${s.id} on ${where} at ${s.capturedAt.slice(0, 19)}. Context synthesis triggered.`,
          },
        ],
      };
    },
  );
}
