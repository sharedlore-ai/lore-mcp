import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

interface BriefingNode {
  id: string;
  path: string;
  title: string;
  kind: string;
  body: string | null;
  updatedAt: string;
}

interface BriefingSession {
  id: string;
  summary: string | null;
  body: string;
  capturedAt: string;
  author: { name: string | null; email: string };
  node: { path: string } | null;
}

interface Briefing {
  contexts: BriefingNode[];
  recentSessions: BriefingSession[];
}

const QUERY = `query Briefing($projectId: ID!) {
  briefing(projectId: $projectId) {
    contexts { id path title kind body updatedAt }
    recentSessions {
      id summary body capturedAt
      author { name email }
      node { path }
    }
  }
}`;

function truncate(text: string, max = 600): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export function registerStart(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_start",
    "Load the team briefing for a project: the area context docs plus recent session captures. The team /start.",
    {
      directive: z
        .string()
        .optional()
        .describe("Optional focus directive to frame what you are about to work on."),
      project: z.string().optional().describe("Project slug (defaults to .lorerc in cwd, then LORE_PROJECT)."),
    },
    async ({ directive, project }) => {
      const projectId = await client.resolveProjectId(project);
      const { briefing } = await client.graphql<{ briefing: Briefing }>(QUERY, { projectId });

      const lines: string[] = [];
      if (directive) lines.push(`Directive: ${directive}`, "");

      lines.push("# Area context");
      if (briefing.contexts.length === 0) {
        lines.push("(no context docs yet)");
      } else {
        for (const ctx of briefing.contexts) {
          lines.push(`\n## ${ctx.title}  [${ctx.path}]`);
          if (ctx.body) lines.push(truncate(ctx.body));
        }
      }

      lines.push("", "# Recent captures");
      if (briefing.recentSessions.length === 0) {
        lines.push("(no recent sessions)");
      } else {
        for (const s of briefing.recentSessions) {
          const who = s.author.name ?? s.author.email;
          const where = s.node?.path ? ` @ ${s.node.path}` : "";
          const when = s.capturedAt.slice(0, 10);
          lines.push(`\n- [${when}] ${who}${where}`);
          lines.push(`  ${truncate(s.summary ?? s.body, 300)}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );
}
