import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertMcpInstallMode } from "./mcp/service.js";
import { registerTools } from "./mcp/tools.js";
import { ensureRepositoryLinkColumns } from "./lib/startup-migration.js";

assertMcpInstallMode();
await ensureRepositoryLinkColumns();

const server = new McpServer({
  name: "erdbpro",
  version: process.env.APP_VERSION || "3.3.4",
}, {
  instructions: "Understand natural-language requests without requiring tool names. Use read-only tools for investigation. For any Note append or history restore, create a proposal first, show its preview, and wait for explicit user confirmation before applying it. Never expose database passwords or TLS keys, and answer in the user's language.",
});
registerTools(server);

await server.connect(new StdioServerTransport());
