export interface LoreConfig {
  apiUrl: string;
  apiToken: string;
  defaultProject: string;
}

export function loadConfig(): LoreConfig {
  return {
    apiUrl: process.env.LORE_API_URL ?? "http://localhost:3030/graphql",
    apiToken: process.env.LORE_API_TOKEN ?? "",
    defaultProject: process.env.LORE_PROJECT ?? "",
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

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    if (!this.config.apiToken) {
      throw new LoreError(
        "Missing LORE_API_TOKEN. Create one in the SharedLore dashboard (API tokens) and set it in the MCP env.",
      );
    }

    let res: Response;
    try {
      res = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiToken}`,
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
        "No project specified and LORE_PROJECT is not set. Pass a project slug or set LORE_PROJECT.",
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
}

function humanizeError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not authorized") || lower.includes("pundit")) {
    return `Not authorized: ${message}. Your API token's role may be read-only (viewer) for this action.`;
  }
  return message;
}
