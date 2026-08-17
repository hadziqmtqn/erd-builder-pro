import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import {
  MCP_DOCUMENT_TYPES,
  applyNoteAppend,
  historyList,
  historyRead,
  listDbCatalogs,
  listWorkspaceFiles,
  proposeNoteAppend,
  readDbSchema,
  readDocument,
  resolveMcpUserId,
  runReadOnlyQuery,
} from "./service.js";

const documentType = z.enum(MCP_DOCUMENT_TYPES);
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
const jsonResult = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

export function registerTools(server: McpServer) {
  server.registerTool("workspace_list_files", {
    description: "List ERD Builder Pro projects, Notes, Flowcharts, and ERD diagrams owned by the local user. Drawings are intentionally excluded.",
    inputSchema: { project_uid: z.string().optional() }, annotations: readOnly,
  }, async ({ project_uid }) => jsonResult(await listWorkspaceFiles(await resolveMcpUserId(), project_uid)));

  server.registerTool("document_read", {
    description: "Read one local Note, Flowchart, or ERD diagram by UUID or numeric ID.",
    inputSchema: { type: documentType, uid: z.string().min(1) }, annotations: readOnly,
  }, async ({ type, uid }) => jsonResult(await readDocument(await resolveMcpUserId(), type, uid)));

  server.registerTool("history_list", {
    description: "List snapshot versions for a local Note, Flowchart, or ERD diagram.",
    inputSchema: { type: documentType, uid: z.string().min(1), limit: z.number().int().min(1).max(100).default(20) }, annotations: readOnly,
  }, async ({ type, uid, limit }) => jsonResult(await historyList(await resolveMcpUserId(), type, uid, limit)));

  server.registerTool("history_read", {
    description: "Read one snapshot version without restoring it.",
    inputSchema: { type: documentType, uid: z.string().min(1), revision_id: z.string().min(1) }, annotations: readOnly,
  }, async ({ type, uid, revision_id }) => jsonResult(await historyRead(await resolveMcpUserId(), type, uid, revision_id)));

  server.registerTool("db_list_catalogs", {
    description: "List configured DB Client catalogs and non-secret connection metadata. Passwords and TLS keys are never returned.",
    annotations: readOnly,
  }, async () => jsonResult(await listDbCatalogs(await resolveMcpUserId())));

  server.registerTool("db_read_schema", {
    description: "Read tables, columns, indexes, checks, and foreign keys from one DB Client catalog.",
    inputSchema: { catalog_id: z.number().int().positive() }, annotations: readOnly,
  }, async ({ catalog_id }) => jsonResult(await readDbSchema(await resolveMcpUserId(), catalog_id)));

  server.registerTool("db_query_read_only", {
    description: "Run one SELECT/CTE against a PostgreSQL or MySQL DB Client catalog in a forced read-only session.",
    inputSchema: { catalog_id: z.number().int().positive(), sql: z.string().min(1).max(100_000), max_rows: z.number().int().min(1).max(500).default(100) }, annotations: readOnly,
  }, async ({ catalog_id, sql, max_rows }) => jsonResult(await runReadOnlyQuery(await resolveMcpUserId(), catalog_id, sql, max_rows)));

  server.registerTool("note_append_propose", {
    description: "Prepare a plain-text append to a Note. This does not modify data; show the preview to the user before applying.",
    inputSchema: { note_uid: z.string().min(1), text: z.string().min(1).max(100_000) }, annotations: readOnly,
  }, async ({ note_uid, text }) => jsonResult(await proposeNoteAppend(await resolveMcpUserId(), note_uid, text)));

  server.registerTool("note_append_apply", {
    description: "Apply a previously proposed Note append. Requires the exact proposal ID as confirmation, rejects stale Notes, and creates an entity_changes safety snapshot.",
    inputSchema: { proposal_id: z.string().uuid(), confirmation: z.string().uuid() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async ({ proposal_id, confirmation }) => jsonResult(await applyNoteAppend(await resolveMcpUserId(), proposal_id, confirmation)));
}
