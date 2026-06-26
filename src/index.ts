#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LoreClient, loadConfig } from "./client.js";
import { registerStart } from "./tools/start.js";
import { registerCapture } from "./tools/capture.js";
import { registerDocs } from "./tools/docs.js";
import { registerTree } from "./tools/tree.js";
import { registerContext } from "./tools/context.js";
import { registerSearch } from "./tools/search.js";
import { registerProjects } from "./tools/projects.js";
import { registerManage } from "./tools/manage.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const client = new LoreClient(config);

  const server = new McpServer({
    name: "sharedlore",
    version: "0.1.0",
  });

  registerStart(server, client);
  registerCapture(server, client);
  registerDocs(server, client);
  registerTree(server, client);
  registerContext(server, client);
  registerSearch(server, client);
  registerProjects(server, client);
  registerManage(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("sharedlore-mcp failed to start:", err);
  process.exit(1);
});
