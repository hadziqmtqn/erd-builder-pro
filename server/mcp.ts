import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { assertMcpInstallMode } from "./mcp/service.js";
import { registerTools } from "./mcp/tools.js";

assertMcpInstallMode();

const server = new McpServer({ name: "erdbpro", version: process.env.APP_VERSION || "3.3.4" });
registerTools(server);

await server.connect(new StdioServerTransport());
