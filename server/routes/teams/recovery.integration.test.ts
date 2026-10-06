import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runWithTeamScope } from "../../lib/team-scope.js";

const fixture = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma.js", () => ({ get prisma() { return fixture.db; } }));
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: () => false }));
vi.mock("../../lib/team-provisioning.js", () => ({ isProvisionedTeam: (team: any) => team.provisioningSignature === "verified", isProvisionedMembership: () => true }));
vi.mock("./service.js", () => ({
  TeamServiceError: class extends Error { constructor(public code: string, public status: number, message = code) { super(message); } },
  requireActiveInstanceLicense: async () => ({ maxTeams: 10, maxMembers: 10 }),
}));

const enabled = process.env.TEAM_RECOVERY_INTEGRATION === "1";
const schema = `test_sh_recovery_${randomUUID().replaceAll("-", "")}`;
const actorId = randomUUID(), sourceId = randomUUID(), targetId = randomUUID();
let pool: pg.Pool;
let created = false;
let recovery: typeof import("./recovery.js");
let notes: typeof import("../notes/service.js");
let diagrams: typeof import("../diagrams/service.js");
let drawings: typeof import("../drawings/service.js");
let flowcharts: typeof import("../flowcharts/service.js");
let project: any, diagram: any, note: any, drawing: any, flowchart: any;

describe.skipIf(!enabled)("SH-001 recovery copy in an isolated PostgreSQL schema", () => {
  beforeAll(async () => {
    dotenv.config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("Recovery tests require a localhost disposable schema.");
    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const sql = execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.pg.prisma", "--script"], { encoding: "utf8", env: { ...process.env, DB_VARIANT: "pg" }, stdio: ["ignore", "pipe", "ignore"] });
    const connection = await pool.connect();
    try {
      await connection.query(`SET search_path TO "${schema}"`);
      await connection.query(sql.replaceAll('"public"', `"${schema}"`));
    } finally { connection.release(); }
    const require = createRequire(import.meta.url);
    const { PrismaClient } = require("@erdbpro/prisma-pg-local");
    fixture.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4 }, { schema }) });
    recovery = await import("./recovery.js");
    [notes, diagrams, drawings, flowcharts] = await Promise.all([
      import("../notes/service.js"),
      import("../diagrams/service.js"),
      import("../drawings/service.js"),
      import("../flowcharts/service.js"),
    ]);
  }, 30000);

  beforeEach(async () => {
    const db = fixture.db;
    for (const model of ["relationship", "tableConstraint", "tableIndex", "column", "entity", "diagram", "note", "drawing", "flowchart", "project", "teamAuditEvent", "teamMember", "team", "user"]) await db[model].deleteMany();
    await db.user.create({ data: { id: actorId, email: "recovery@example.test", password: "fixture-only", isSuperAdmin: true } });
    await db.team.create({ data: { id: sourceId, name: "Quarantined", status: "quarantined", provisioningSignature: "invalid" } });
    await db.team.create({ data: { id: targetId, name: "Active", status: "active", provisioningSignature: "verified" } });
    project = await db.project.create({ data: { name: "Retained project", teamId: sourceId, userId: actorId } });
    diagram = await db.diagram.create({ data: { name: "Database", projectId: project.id, userId: actorId, uid: randomUUID(), isPublic: true, publicAccess: "link", shareToken: "old-share", viewportX: 12, viewportZoom: 1.5 } });
    const entityId = "source", primaryId = "a", foreignId = "parent-a";
    await db.entity.create({ data: { id: entityId, diagramId: diagram.id, name: "nodes", x: 10, y: 20 } });
    await db.column.createMany({ data: [{ id: primaryId, entityId, name: "id", type: "integer", isPk: true }, { id: foreignId, entityId, name: "parent_id", type: "integer" }] });
    await db.tableConstraint.create({ data: { id: randomUUID(), entityId, kind: "primary_key", columnIds: JSON.stringify([primaryId]) } });
    await db.tableIndex.create({ data: { id: randomUUID(), entityId, name: "idx_parent", columnIds: JSON.stringify([foreignId]) } });
    await db.relationship.create({ data: { id: randomUUID(), diagramId: diagram.id, sourceEntityId: entityId, targetEntityId: entityId, sourceColumnId: foreignId, targetColumnId: primaryId, sourceHandle: `col-${foreignId}-source-l`, targetHandle: `col-${primaryId}-target-r` } });
    note = await db.note.create({ data: { title: "Notes", content: '<p>Retained <img src="/api/serve/erd-builder-pro/notes/image.png?token=source-secret"></p>', projectId: project.id, userId: actorId } });
    drawing = await db.drawing.create({ data: { title: "Drawing", data: JSON.stringify({ elements: [], files: { image: { dataURL: "/api/serve/erd-builder-pro/drawings/image.png?token=source-secret" } } }), projectId: project.id, userId: actorId } });
    flowchart = await db.flowchart.create({ data: { title: "Flow", data: '{"nodes":[],"edges":[]}', projectId: project.id, userId: actorId } });
  });

  afterAll(async () => {
    await fixture.db?.$disconnect();
    if (created) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      expect((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
  });

  const request = () => ({ operationId: randomUUID(), targetTeamId: targetId, files: [{ type: "erd" as const, id: diagram.id }, { type: "notes" as const, id: note.id }, { type: "drawings" as const, id: drawing.id }, { type: "flowchart" as const, id: flowchart.id }] });

  it("copies all four file types, remaps ERD relations, retains the source and replays safely", async () => {
    const db = fixture.db;
    const recipientId = randomUUID();
    await db.user.create({ data: { id: recipientId, email: "recipient@example.test", password: "fixture-only" } });
    await db.teamMember.create({ data: { id: randomUUID(), teamId: targetId, userId: recipientId, role: "staff", status: "active", provisioningSignature: "verified" } });
    const before = await db.diagram.findUnique({ where: { id: diagram.id }, include: { entities: { include: { columns: true } }, relationships: true } });
    const input = request();
    const result = await recovery.recoverFiles(sourceId, actorId, true, input);
    expect(result).toMatchObject({ fileCount: 4, projectCount: 1 });
    const copied = await db.diagram.findUnique({ where: { id: result.items.find((item: any) => item.type === "erd").copiedId }, include: { entities: { include: { columns: true, constraints: true, indexes: true } }, relationships: true, project: true } });
    expect(copied.project.teamId).toBe(targetId);
    expect(copied.uid).not.toBe(diagram.uid);
    expect(copied).toMatchObject({ isPublic: false, publicAccess: "off", shareToken: null, shareTokenHash: null, viewportX: 12, viewportZoom: 1.5 });
    const entity = copied.entities[0];
    const primary = entity.columns.find((column: any) => column.name === "id");
    const foreign = entity.columns.find((column: any) => column.name === "parent_id");
    expect(entity.id).not.toBe(before.entities[0].id);
    expect(JSON.parse(entity.constraints[0].columnIds)).toEqual([primary.id]);
    expect(JSON.parse(entity.indexes[0].columnIds)).toEqual([foreign.id]);
    expect(copied.relationships[0]).toMatchObject({ sourceEntityId: entity.id, targetEntityId: entity.id, sourceColumnId: foreign.id, targetColumnId: primary.id, sourceHandle: `col-${foreign.id}-source-l`, targetHandle: `col-${primary.id}-target-r` });
    expect(await db.diagram.findUnique({ where: { id: diagram.id }, include: { entities: { include: { columns: true } }, relationships: true } })).toEqual(before);
    expect(await db.note.count()).toBe(2);
    const copiedNote = await db.note.findUnique({ where: { id: result.items.find((item: any) => item.type === "notes").copiedId } });
    expect(copiedNote.content).toContain("/api/serve/erd-builder-pro/notes/image.png");
    expect(copiedNote.content).not.toContain("source-secret");
    expect((await db.note.findUnique({ where: { id: note.id } })).content).toBe(note.content);
    expect(await db.drawing.count()).toBe(2);
    expect((await db.drawing.findUnique({ where: { id: result.items.find((item: any) => item.type === "drawings").copiedId } })).data).not.toContain("source-secret");
    expect(await db.flowchart.count()).toBe(2);
    const copiedUids = Object.fromEntries(result.items.map((item: any) => [item.type, item.copiedUid]));
    const recipientReads = await runWithTeamScope({ mode: "team", teamId: targetId }, () => Promise.all([
      notes.getNote(copiedUids.notes, recipientId),
      diagrams.getDiagram(copiedUids.erd, recipientId),
      drawings.getDrawing(copiedUids.drawings, recipientId),
      flowcharts.getFlowchart(copiedUids.flowchart, recipientId),
    ]));
    expect(recipientReads.every(Boolean)).toBe(true);
    await expect(runWithTeamScope({ mode: "team", teamId: sourceId }, () => notes.getNote(copiedUids.notes, recipientId))).resolves.toBeNull();
    await expect(runWithTeamScope({ mode: "personal", teamId: null }, () => notes.getNote(copiedUids.notes, recipientId))).resolves.toBeNull();
    expect(await recovery.recoverFiles(sourceId, actorId, true, input)).toEqual(result);
    expect(await db.project.count()).toBe(2);
    expect(await db.team.count()).toBe(2);
    expect(await db.teamMember.count()).toBe(1);
    expect(await db.team.findUnique({ where: { id: sourceId } })).toMatchObject({ status: "quarantined", provisioningSignature: "invalid" });
    const inventory = await recovery.recoveryInventory(sourceId, true);
    expect(inventory.files.every((file: any) => file.recovery?.teamName === "Active")).toBe(true);
  });

  it("rolls back the whole batch when a later selection is outside the source", async () => {
    const destinationProject = await fixture.db.project.create({ data: { name: "Foreign", teamId: targetId, userId: actorId } });
    const foreign = await fixture.db.note.create({ data: { title: "Foreign", projectId: destinationProject.id } });
    await expect(recovery.recoverFiles(sourceId, actorId, true, { operationId: randomUUID(), targetTeamId: targetId, files: [{ type: "notes", id: note.id }, { type: "notes", id: foreign.id }] })).rejects.toMatchObject({ code: "RECOVERY_FILE_UNAVAILABLE" });
    expect(await fixture.db.project.count()).toBe(2);
    expect(await fixture.db.note.count()).toBe(2);
    expect(await fixture.db.teamAuditEvent.count()).toBe(0);
  });

  it("rolls back all copies when the recovery audit cannot be saved", async () => {
    await pool.query(`ALTER TABLE "${schema}".team_audit_events ADD CONSTRAINT reject_recovery CHECK (action <> 'files_recovered')`);
    try {
      await expect(recovery.recoverFiles(sourceId, actorId, true, request())).rejects.toThrow();
      expect(await fixture.db.project.count()).toBe(1);
      expect(await fixture.db.diagram.count()).toBe(1);
      expect(await fixture.db.note.count()).toBe(1);
      expect(await fixture.db.teamAuditEvent.count()).toBe(0);
    } finally { await pool.query(`ALTER TABLE "${schema}".team_audit_events DROP CONSTRAINT reject_recovery`); }
  });

  it("rejects an unresolved ERD relationship without leaving partial copies", async () => {
    await fixture.db.relationship.updateMany({ where: { diagramId: diagram.id }, data: { sourceColumnId: "foreign-column" } });
    await expect(recovery.recoverFiles(sourceId, actorId, true, request())).rejects.toMatchObject({ code: "RECOVERY_DATA_INVALID" });
    expect(await fixture.db.project.count()).toBe(1);
    expect(await fixture.db.diagram.count()).toBe(1);
    expect(await fixture.db.entity.count()).toBe(1);
    expect(await fixture.db.teamAuditEvent.count()).toBe(0);
  });
});
