# @sharedlore/mcp

A thin [MCP](https://modelcontextprotocol.io) server over the **lore-api** GraphQL endpoint.
It gives an AI agent team-shared "lore": area context docs, append-only session captures,
and structured docs (ADRs, logs, TODOs, plans).

The server is stateless — every tool call hits the lore-api GraphQL endpoint over HTTPS.

## Tools

| Tool | What it does |
| --- | --- |
| `lore_projects` | List the projects in the token's org (the token fixes the org). Returns the org name + each project's `slug`/`name`. Powers `/lore:init`. |
| `lore_create_project` | Create a project in the token's org (`name`, optional `slug` — derived from the name if omitted). Returns the created `slug`/`name`. |
| `lore_start` | Team `/start`: loads the project briefing (area context docs + recent captures). Optional `directive`. |
| `lore_capture` | Append a session capture to a node (by `path` or id). Append-only; triggers server-side context synthesis. |
| `lore_adr` | Create/update an ADR node by path (kind `adr`). |
| `lore_log` | Create/update a log node by path (kind `log`). |
| `lore_todo` | Create/update a TODO node by path (kind `todo`). |
| `lore_plan` | Create/update a plan node by path (kind `plan`). |
| `lore_tree` | List the folder/doc tree (optionally scoped by `parentId` or `kind`). |
| `lore_context` | Fetch the derived area context document at a `path`. |
| `lore_search` | Search nodes by path substring (optional `kind`). |

Every write/read tool accepts an optional `project` slug. Resolution precedence when a tool
omits `project`: the `.lorerc` file at the repo root (a `{ "project": "<slug>" }` JSON file,
found by walking up parent directories from the server's cwd, like git finds `.git`) → the
`LORE_PROJECT` env var. Run `lore link <slug>` (from `@sharedlore/cli`) to write `.lorerc`.

## Configuration (env)

| Var | Default | Purpose |
| --- | --- | --- |
| `LORE_API_URL` | `http://localhost:3030/graphql` | GraphQL endpoint. |
| `LORE_API_TOKEN` | — | The `lore_sk_...` API token. Sent as `Authorization: Bearer <token>`. The token scopes the org server-side, so no org header is needed. |
| `LORE_PROJECT` | — | Fallback project slug used when a tool omits `project` and no `.lorerc` is found. Prefer `.lorerc` (per-repo) over this. |

### Getting a token

In the SharedLore dashboard, go to **API tokens** and create a new token. Copy the
`lore_sk_...` value (shown once) into `LORE_API_TOKEN`. A token's role (admin / member /
viewer) determines what it can do — a viewer token cannot capture or upsert and tools will
return a clear "not authorized" message.

## Connect (`.mcp.json`)

```json
{
  "mcpServers": {
    "sharedlore": {
      "command": "npx",
      "args": ["-y", "@sharedlore/mcp"],
      "env": {
        "LORE_API_URL": "https://lore.example.com/graphql",
        "LORE_API_TOKEN": "lore_sk_xxx"
      }
    }
  }
}
```

## Develop

```bash
npm install
npm run build   # tsc -> dist/
npm run dev     # tsc --watch
```

Requires Node 20+ (uses the global `fetch`).
