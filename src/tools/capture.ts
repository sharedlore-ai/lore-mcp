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
    "Append an append-only session - project- and user-scoped. A session is one unit of work you did (a ticket / bug / feature); you can have several per day across projects. By default it is a project-level session (no node) - omit `node`. Optionally pass `node` to also attach it to an area. The backend only stores it; nothing is synthesized.",
    {
      body: z.string().describe("The full session body - what was done, decisions, findings."),
      summary: z.string().optional().describe("Optional one-line summary (e.g. the ticket / feature)."),
      node: z.string().optional().describe("Optional area path or node id to attach the session to. Omit for a plain project-level session. Created as a folder if it doesn't exist."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ body, summary, node, project }) => {
      const projectId = await client.resolveProjectId(project);
      const nodeId = node ? await client.resolveOrCreateNodeId(projectId, node) : undefined;

      const data = await client.graphql<{
        captureSession: {
          session: { id: string; capturedAt: string; node: { path: string; title: string } | null };
        };
      }>(MUTATION, { input: { projectId, nodeId, body, summary } });

      const s = data.captureSession.session;
      const where = s.node ? `area ${s.node.title} [${s.node.path}]` : "the project";
      return {
        content: [
          {
            type: "text",
            text: `Captured session ${s.id} on ${where} at ${s.capturedAt.slice(0, 19)}.`,
          },
        ],
      };
    },
  );
}
