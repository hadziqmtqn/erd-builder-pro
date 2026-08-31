import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  PUBLIC_MCP_DOCUMENT_TYPES,
  listPublicHistory,
  listPublicWorkspaceFiles,
  readPublicDocument,
  readPublicHistory,
  searchPublicWorkspace,
} from "./public-service.js";
import { WORKSPACE_SEARCH_TYPES } from "./workspace-search.js";

export const PUBLIC_MCP_TOOL_NAMES = [
  "workspace_list_files",
  "workspace_search",
  "document_read",
  "history_list",
  "history_read",
] as const;

const documentType = z.enum(PUBLIC_MCP_DOCUMENT_TYPES);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const jsonResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

export function registerPublicMcpTools(server: McpServer, userId: string) {
  server.registerTool(PUBLIC_MCP_TOOL_NAMES[0], {
    description: "List this user's active Web App projects, Notes, Flowcharts, Drawings, and regular ERD diagrams. DB Client and production database diagrams are excluded.",
    inputSchema: z.object({ project_uid: z.string().min(1).optional() }),
    annotations: readOnly,
  }, async ({ project_uid }) => jsonResult(await listPublicWorkspaceFiles(userId, project_uid)));

  server.registerTool(PUBLIC_MCP_TOOL_NAMES[1], {
    description: "Find a permitted Web App project or file by semantic path, project name, feature, or title. Use document_read with the returned type and uid to read its content.",
    inputSchema: z.object({
      query: z.string().min(1).max(500),
      type: z.enum(WORKSPACE_SEARCH_TYPES).exclude(["db_clients"]).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    annotations: readOnly,
  }, async ({ query, type, limit }) => jsonResult(await searchPublicWorkspace(userId, query, type, limit)));

  server.registerTool(PUBLIC_MCP_TOOL_NAMES[2], {
    description: "Read one Web App Note, Flowchart, Drawing, or regular ERD by UUID or numeric ID. DB Client and production database diagrams are unavailable.",
    inputSchema: z.object({ type: documentType, uid: z.string().min(1) }),
    annotations: readOnly,
  }, async ({ type, uid }) => jsonResult(await readPublicDocument(userId, type, uid)));

  server.registerTool(PUBLIC_MCP_TOOL_NAMES[3], {
    description: "List saved history revisions for one permitted Web App document.",
    inputSchema: z.object({ type: documentType, uid: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) }),
    annotations: readOnly,
  }, async ({ type, uid, limit }) => jsonResult(await listPublicHistory(userId, type, uid, limit)));

  server.registerTool(PUBLIC_MCP_TOOL_NAMES[4], {
    description: "Read one saved history revision without restoring or modifying data.",
    inputSchema: z.object({ type: documentType, uid: z.string().min(1), revision_id: z.string().min(1) }),
    annotations: readOnly,
  }, async ({ type, uid, revision_id }) => jsonResult(await readPublicHistory(userId, type, uid, revision_id)));
}
