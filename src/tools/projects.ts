import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LoreClient } from "../client.js";

interface ProjectSummary {
  slug: string;
  name: string;
}

interface OrgWithProjects {
  slug: string;
  name: string;
  projects: (ProjectSummary | null)[];
}

const ORGS_QUERY = `query {
  organizations {
    slug
    name
    projects { slug name }
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

export function registerProjects(server: McpServer, client: LoreClient): void {
  server.tool(
    "lore_projects",
    "List every organization and project you can access (personal ones and orgs you've joined), grouped by organization. Your API token is personal - it spans all your orgs. Use this to pick or confirm which project a repo should be linked to (see /lore:init).",
    {},
    async () => {
      const data = await client.graphql<{ organizations: OrgWithProjects[] }>(ORGS_QUERY);
      const orgs = data.organizations ?? [];

      if (orgs.length === 0) {
        return {
          content: [{ type: "text", text: "You don't belong to any organizations yet." }],
        };
      }

      const lines: string[] = [];
      for (const org of orgs) {
        lines.push(`Organization: ${org.name} (${org.slug})`);
        const projects = (org.projects ?? []).filter(
          (p): p is ProjectSummary => p !== null,
        );
        if (projects.length === 0) {
          lines.push(`  (no projects - create one with lore_create_project organization:"${org.slug}")`);
        } else {
          for (const p of projects) lines.push(`  - ${p.slug}  -  ${p.name}`);
        }
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n").trim() }] };
    },
  );

  server.tool(
    "lore_create_project",
    "Create a new project in one of your organizations. Pass the organization slug (from lore_projects) and a name; the slug is derived from the name (lowercase, dashes) unless you pass an explicit slug. Used by /lore:init when the user chooses to create a new project.",
    {
      organization: z
        .string()
        .describe("Slug of the organization to create the project in (from lore_projects)."),
      name: z.string().describe("Human-readable project name, e.g. \"Trading Bot\"."),
      slug: z
        .string()
        .optional()
        .describe("Optional explicit slug. Defaults to a slug derived from the name."),
    },
    async ({ organization, name, slug }) => {
      const finalSlug = (slug?.trim() || slugify(name)).trim();
      if (!finalSlug) {
        return {
          content: [
            { type: "text", text: "Could not derive a slug from that name. Pass an explicit slug." },
          ],
        };
      }

      const data = await client.graphql<{ createProject: { project: ProjectSummary } }>(
        CREATE_MUTATION,
        { input: { name: name.trim(), slug: finalSlug } },
        organization.trim(),
      );

      const p = data.createProject.project;
      return {
        content: [{ type: "text", text: `Created project ${p.slug} - ${p.name} in ${organization}.` }],
      };
    },
  );
}
