import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

interface OrgSummary {
  slug: string;
  name: string;
}

interface ProjectSummary {
  slug: string;
  name: string;
}

const ORG_QUERY = `query Org { organizations { slug name } }`;

const PROJECTS_QUERY = `query Projects {
  projects(first: 200) {
    nodes { slug name }
  }
}`;

const CREATE_MUTATION = `mutation CreateProject($input: CreateProjectInput!) {
  createProject(input: $input) {
    project { slug name }
  }
}`;

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchOrg(client: LoreClient): Promise<OrgSummary | null> {
  const data = await client.graphql<{ organizations: OrgSummary[] }>(ORG_QUERY);
  return data.organizations[0] ?? null;
}

export function registerProjects(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_projects",
    "List the projects in the API token's organization (the org is fixed by the token). Returns the org name and each project's slug + name. Use this to pick or confirm which project a repo should be linked to (see /lore:init).",
    {},
    async () => {
      const org = await fetchOrg(client);
      const data = await client.graphql<{ projects: { nodes: (ProjectSummary | null)[] } }>(
        PROJECTS_QUERY,
      );
      const projects = (data.projects.nodes ?? []).filter(
        (p): p is ProjectSummary => p !== null,
      );

      const lines: string[] = [];
      lines.push(org ? `Organization: ${org.name} (${org.slug})` : "Organization: (unknown)");
      lines.push("");
      if (projects.length === 0) {
        lines.push("No projects yet. Use lore_create_project to create the first one.");
      } else {
        lines.push("Projects:");
        for (const p of projects) {
          lines.push(`- ${p.slug}  -  ${p.name}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.tool(
    "lore_create_project",
    "Create a new project in the API token's organization. Provide a name; the slug is derived from the name (lowercase, dashes) unless you pass an explicit slug. Returns the created project's slug + name. Used by /lore:init when the user chooses to create a new project.",
    {
      name: z.string().describe("Human-readable project name, e.g. \"Trading Bot\"."),
      slug: z
        .string()
        .optional()
        .describe("Optional explicit slug. Defaults to a slug derived from the name."),
    },
    async ({ name, slug }) => {
      const finalSlug = (slug?.trim() || slugify(name)).trim();
      if (!finalSlug) {
        return {
          content: [
            {
              type: "text",
              text: "Could not derive a slug from that name. Pass an explicit slug.",
            },
          ],
        };
      }

      const data = await client.graphql<{
        createProject: { project: ProjectSummary };
      }>(CREATE_MUTATION, { input: { name: name.trim(), slug: finalSlug } });

      const p = data.createProject.project;
      return {
        content: [{ type: "text", text: `Created project ${p.slug} - ${p.name}.` }],
      };
    },
  );
}
