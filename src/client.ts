import { existsSync, readFileSync } from "node:fs";
import { dirname, join, parse } from "node:path";

export interface LoreConfig {
  apiUrl: string;
  apiToken: string;
  defaultProject: string;
  organization: string;
}

export interface Lorerc {
  project: string;
  organization: string;
}

// Tokens are user-scoped, so the org is resolved per-repo from .lorerc and sent
// to the API on each request. .lorerc carries both `organization` and `project`.
export function readLorerc(startDir: string = process.cwd()): Lorerc {
  let dir = startDir;
  const root = parse(dir).root;
  while (true) {
    const candidate = join(dir, ".lorerc");
    if (existsSync(candidate)) {
      try {
        const parsed = JSON.parse(readFileSync(candidate, "utf8")) as {
          project?: unknown;
          organization?: unknown;
        };
        const project = typeof parsed.project === "string" ? parsed.project.trim() : "";
        const organization =
          typeof parsed.organization === "string" ? parsed.organization.trim() : "";
        if (project || organization) return { project, organization };
      } catch {
        // Ignore an unreadable/invalid .lorerc and keep walking up.
      }
    }
    if (dir === root) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { project: "", organization: "" };
}

export function loadConfig(): LoreConfig {
  const rc = readLorerc();
  return {
    apiUrl: process.env.LORE_API_URL ?? "https://api.sharedlore.com/graphql",
    apiToken: process.env.LORE_API_TOKEN ?? "",
    defaultProject: rc.project || process.env.LORE_PROJECT || "",
    organization: rc.organization || process.env.LORE_ORGANIZATION || "",
  };
}

export class LoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoreError";
  }
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
}

export class LoreClient {
  private projectIdCache = new Map<string, string>();

  constructor(private config: LoreConfig) {}

  get defaultProjectSlug(): string {
    return this.config.defaultProject;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown> = {},
    orgSlug?: string,
  ): Promise<T> {
    if (!this.config.apiToken) {
      throw new LoreError(
        "Missing LORE_API_TOKEN. Create one in the SharedLore dashboard (API tokens) and set it in the MCP env.",
      );
    }

    // User-scoped token: tell the API which org this request is for (from .lorerc,
    // or an explicit override for org-picking flows like lore_create_project).
    const org = orgSlug ?? this.config.organization;

    let res: Response;
    try {
      res = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiToken}`,
          ...(org ? { "X-Organization-Slug": org } : {}),
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new LoreError(
        `Could not reach lore-api at ${this.config.apiUrl}: ${(err as Error).message}`,
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new LoreError(
        `Authentication failed (HTTP ${res.status}). Check that LORE_API_TOKEN is a valid lore_sk_... token.`,
      );
    }

    let payload: GraphQLResponse<T>;
    try {
      payload = (await res.json()) as GraphQLResponse<T>;
    } catch {
      throw new LoreError(`lore-api returned a non-JSON response (HTTP ${res.status}).`);
    }

    if (payload.errors?.length) {
      const message = payload.errors.map((e) => e.message).join("; ");
      throw new LoreError(humanizeError(message));
    }

    if (!payload.data) {
      throw new LoreError("lore-api returned no data.");
    }

    return payload.data;
  }

  async resolveProjectId(slug?: string): Promise<string> {
    const target = (slug ?? this.config.defaultProject).trim();
    if (!target) {
      throw new LoreError(
        "No project specified. Pass a project slug, add a .lorerc ({ \"project\": \"<slug>\" }) at your repo root, or set LORE_PROJECT.",
      );
    }

    const cached = this.projectIdCache.get(target);
    if (cached) return cached;

    const data = await this.graphql<{ project: { id: string; slug: string } | null }>(
      `query ProjectId($slug: String!) { project(slug: $slug) { id slug } }`,
      { slug: target },
    );

    if (!data.project) {
      throw new LoreError(`Project "${target}" was not found in this organization.`);
    }

    this.projectIdCache.set(target, data.project.id);
    return data.project.id;
  }

  async resolveNodeId(projectId: string, nodeOrPath: string): Promise<string> {
    const value = nodeOrPath.trim();
    if (!value) throw new LoreError("A node id or path is required.");

    if (/^\d+$/.test(value)) return value;

    const data = await this.graphql<{ nodeByPath: { id: string } | null }>(
      `query NodeId($projectId: ID!, $path: String!) {
        nodeByPath(projectId: $projectId, path: $path) { id }
      }`,
      { projectId, path: value },
    );

    if (!data.nodeByPath) {
      throw new LoreError(`No node found at path "${value}".`);
    }

    return data.nodeByPath.id;
  }

  async resolveOrCreateNodeId(projectId: string, nodeOrPath: string): Promise<string> {
    const value = nodeOrPath.trim();
    if (!value) throw new LoreError("A node id or path is required.");

    if (/^\d+$/.test(value)) return value;

    try {
      const found = await this.graphql<{ nodeByPath: { id: string } | null }>(
        `query NodeId($projectId: ID!, $path: String!) {
          nodeByPath(projectId: $projectId, path: $path) { id }
        }`,
        { projectId, path: value },
      );
      if (found.nodeByPath) return found.nodeByPath.id;
    } catch (err) {
      // nodeByPath returns a non-null NodeType, so a missing node raises
      // "Node not found" rather than returning null - fall through to create.
      if (!(err instanceof LoreError && /not found/i.test(err.message))) throw err;
    }

    const created = await this.graphql<{ upsertNode: { node: { id: string } } }>(
      `mutation BootstrapArea($input: UpsertNodeInput!) {
        upsertNode(input: $input) { node { id } }
      }`,
      { input: { projectId, path: value, kind: "folder", title: titleFromPath(value) } },
    );
    return created.upsertNode.node.id;
  }
}

function titleFromPath(path: string): string {
  const leaf = path.split("/").filter(Boolean).pop() ?? path;
  return leaf.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not authorized") || lower.includes("pundit")) {
    return `Not authorized: ${message}. Your API token's role may be read-only (viewer) for this action.`;
  }
  return message;
}
