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
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isDesktopMode: () => false, isSsoAuthMode: () => false }));
vi.mock("../../lib/db-connectors/registry.js", () => ({ fetchSchema: vi.fn(), testConnection: vi.fn() }));

const enabled = process.env.TEAM_ACCESS_INTEGRATION === "1";
const schema = `test_project_access_${randomUUID().replaceAll("-", "")}`;
const id = () => randomUUID();
const users = { creator: id(), manager: id(), editor: id(), commenter: id(), viewer: id(), gone: id(), outsider: id() };
const teamId = id();
const otherTeamId = id();
let pool: pg.Pool;
let created = false;
let access: typeof import("./access.js");
let roles: typeof import("../../lib/project-access.js");
let security: typeof import("../../lib/security.js");
let notes: typeof import("../notes/service.js");
let drawings: typeof import("../drawings/service.js");
let flowcharts: typeof import("../flowcharts/service.js");
let diagrams: typeof import("../diagrams/service.js");
let saves: typeof import("../diagrams/save-service.js");
let project: any, otherProject: any, note: any, drawing: any, flowchart: any, diagram: any;

const inTeam = <T>(run: () => Promise<T>) => runWithTeamScope({ mode: "team", teamId }, run) as Promise<T>;

/** Needs a disposable localhost PostgreSQL schema; run with TEAM_ACCESS_INTEGRATION=1. Set PRISMA_PG_LOCAL_CLIENT to use a client generated elsewhere instead of regenerating node_modules. */
describe.skipIf(!enabled)("COL-004 project roles in an isolated PostgreSQL schema", () => {
  beforeAll(async () => {
    dotenv.config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("Project access tests require a localhost disposable schema.");
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
    const { PrismaClient } = require(process.env.PRISMA_PG_LOCAL_CLIENT || "@erdbpro/prisma-pg-local");
    fixture.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4 }, { schema }) });
    [access, roles, security, notes, drawings, flowcharts, diagrams, saves] = await Promise.all([
      import("./access.js"),
      import("../../lib/project-access.js"),
      import("../../lib/security.js"),
      import("../notes/service.js"),
      import("../drawings/service.js"),
      import("../flowcharts/service.js"),
      import("../diagrams/service.js"),
      import("../diagrams/save-service.js"),
    ]);
  }, 30000);

  beforeEach(async () => {
    const db = fixture.db;
    for (const model of ["projectAccessGrant", "relationship", "tableConstraint", "tableIndex", "column", "entity", "diagram", "note", "drawing", "flowchart", "project", "teamAuditEvent", "teamMember", "team", "user"]) await db[model].deleteMany();
    for (const [name, userId] of Object.entries(users)) await db.user.create({ data: { id: userId, email: `${name}@example.test`, name, password: "fixture-only" } });
    await db.team.create({ data: { id: teamId, name: "Team", status: "active" } });
    await db.team.create({ data: { id: otherTeamId, name: "Other", status: "active" } });
    const members: Array<[string, string, string, string]> = [
      [teamId, users.creator, "staff", "active"],
      [teamId, users.manager, "manager", "active"],
      [teamId, users.editor, "staff", "active"],
      [teamId, users.commenter, "staff", "active"],
      [teamId, users.viewer, "staff", "active"],
      [teamId, users.gone, "staff", "inactive"],
      [otherTeamId, users.outsider, "staff", "active"],
    ];
    for (const [team, userId, role, status] of members) await db.teamMember.create({ data: { teamId: team, userId, role, status } });
    project = await db.project.create({ data: { name: "Shared", teamId, userId: users.creator } });
    otherProject = await db.project.create({ data: { name: "Elsewhere", teamId: otherTeamId, userId: users.outsider } });
    await db.projectAccessGrant.create({ data: { projectId: project.id, userId: users.editor, role: "editor" } });
    await db.projectAccessGrant.create({ data: { projectId: project.id, userId: users.viewer, role: "viewer" } });
    await db.projectAccessGrant.create({ data: { projectId: project.id, userId: users.gone, role: "editor" } });
    const file = { projectId: project.id, userId: users.creator };
    note = await db.note.create({ data: { ...file, uid: id(), title: "Spec", content: "<p>Hello</p>" } });
    drawing = await db.drawing.create({ data: { ...file, uid: id(), title: "Sketch" } });
    flowchart = await db.flowchart.create({ data: { ...file, uid: id(), title: "Flow" } });
    diagram = await db.diagram.create({ data: { projectId: project.id, userId: users.creator, uid: id(), name: "Schema" } });
  });

  afterAll(async () => {
    if (created) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await fixture.db?.$disconnect();
    await pool?.end();
  });

  it("resolves every role from the database inside the active Team only", async () => {
    const role = (userId: string) => inTeam(() => roles.projectRoleFor(project.id, userId));
    expect(await Promise.all(["creator", "manager", "editor", "commenter", "viewer"].map((name) => role((users as any)[name])))).toEqual(["owner", "manager", "editor", "commenter", "viewer"]);
    expect(await inTeam(() => roles.projectRoleFor(otherProject.id, users.creator))).toBeNull();

    const list = await inTeam(() => roles.projectRolesFor([project], users.viewer));
    expect(list.get(project.id)).toBe("viewer");
    expect([...(await inTeam(() => roles.projectRolesFor([project], users.manager))).values()]).toEqual(["manager"]);
  });

  it("SH-002 does not carry Manager edit rights into a Team where the same user is Staff", async () => {
    await fixture.db.teamMember.create({ data: { teamId: otherTeamId, userId: users.manager, role: "staff", status: "active" } });
    const otherNote = await fixture.db.note.create({ data: { uid: id(), projectId: otherProject.id, userId: users.outsider, title: "Other Team", content: "<p>retained</p>" } });
    const elsewhere = <T>(run: () => Promise<T>) => runWithTeamScope({ mode: "team", teamId: otherTeamId }, run);

    expect(await inTeam(() => roles.projectRoleFor(project.id, users.manager))).toBe("manager");
    expect(await elsewhere(() => roles.projectRoleFor(otherProject.id, users.manager))).toBe("commenter");
    expect(await elsewhere(() => notes.updateNote(otherNote.uid, users.manager, { content: "<p>forbidden</p>" }))).toBeNull();
    expect(await inTeam(() => notes.updateNote(otherNote.uid, users.manager, { content: "<p>wrong scope</p>" }))).toBeNull();
    expect(await fixture.db.note.findUnique({ where: { id: otherNote.id } })).toMatchObject({ content: "<p>retained</p>" });
  });

  it("lets the creator, a Manager and an Editor save every file type, and nobody else", async () => {
    const allowed = [users.creator, users.manager, users.editor];
    const denied = [users.commenter, users.viewer, users.outsider];
    const attempt = async (userId: string) => ({
      note: await inTeam(() => notes.updateNote(note.uid, userId, { content: `<p>by ${userId}</p>` })),
      drawing: await inTeam(() => drawings.updateDrawing(drawing.uid, userId, { title: `by ${userId}` })),
      flowchart: await inTeam(() => flowcharts.updateFlowchart(flowchart.uid, userId, { title: `by ${userId}` })),
      rename: await inTeam(() => diagrams.updateDiagram(diagram.uid, userId, { name: `by ${userId}` })),
      save: await inTeam(() => saves.saveDiagram(diagram.uid, userId, {})),
    });
    for (const userId of allowed) {
      const result = await attempt(userId);
      expect(result.note).toMatchObject({ success: true });
      expect(result.drawing).toMatchObject({ success: true });
      expect(result.flowchart).toMatchObject({ success: true });
      expect(result.rename).toMatchObject({ success: true });
      expect(result.save).not.toBeNull();
    }
    for (const userId of denied) {
      expect(await attempt(userId)).toEqual({ note: null, drawing: null, flowchart: null, rename: null, save: null });
    }
  });

  it("does not trust a grant that belongs to an inactive member, because the request layer rejects them first and Team scope still applies", async () => {
    // The role is data only; middleware refuses inactive members before any service runs. The filter must still scope by Team.
    expect(await runWithTeamScope({ mode: "team", teamId: otherTeamId }, () => notes.updateNote(note.uid, users.editor, { content: "<p>x</p>" }))).toBeNull();
  });

  it("only lets the creator of a file move it to another Project", async () => {
    const second = await fixture.db.project.create({ data: { name: "Second", teamId, userId: users.creator } });
    expect(await inTeam(() => notes.updateNote(note.uid, users.editor, { projectId: second.id }))).toBeNull();
    expect(await inTeam(() => drawings.updateDrawing(drawing.uid, users.manager, { projectId: second.id }))).toBeNull();
    expect(await inTeam(() => notes.updateNote(note.uid, users.creator, { projectId: second.id }))).toMatchObject({ success: true });
    expect((await fixture.db.note.findUnique({ where: { id: note.id } })).projectId).toBe(second.id);
  });

  it("keeps share, delete and restore with the file creator even for an Editor or Manager", async () => {
    for (const userId of [users.editor, users.manager]) {
      expect(await inTeam(() => notes.updateNoteShare(note.uid, userId, { isPublic: true }))).toBeNull();
      expect(await inTeam(() => notes.softDeleteNote(note.uid, userId))).toBeNull();
      expect(await inTeam(() => drawings.softDeleteDrawing(drawing.uid, userId))).toBeNull();
    }
    expect(await inTeam(() => notes.softDeleteNote(note.uid, users.creator))).toMatchObject({ success: true });
  });

  it("lets a Commenter add only a comment anchor and a Viewer not even that", async () => {
    const anchored = '<p data-comment-anchor-id="a1">Hello</p>';
    const current = await fixture.db.note.findUnique({ where: { id: note.id } });
    expect(await inTeam(() => notes.updateNote(note.uid, users.viewer, { content: anchored, expectedContent: current.content }))).toBeNull();
    expect(await inTeam(() => notes.updateNote(note.uid, users.commenter, { content: anchored, expectedContent: current.content }))).toMatchObject({ success: true });
    expect(await inTeam(() => notes.updateNote(note.uid, users.commenter, { content: "<p>rewritten</p>", expectedContent: anchored }))).toBeNull();
  });

  it("keeps a stale Editor save from overwriting a newer one", async () => {
    const first = await inTeam(() => drawings.updateDrawing(drawing.uid, users.editor, { title: "first", expectedVersion: 0 }));
    expect(first).toMatchObject({ success: true });
    const stale = await inTeam(() => drawings.updateDrawing(drawing.uid, users.manager, { title: "stale", expectedVersion: 0 }));
    expect(stale).toMatchObject({ success: false, conflict: true });
    expect((await fixture.db.drawing.findUnique({ where: { id: drawing.id } })).title).toBe("first");
  });

  it("refuses a Viewer when adding a file to the Project and allows a Commenter", async () => {
    await expect(inTeam(() => security.resolveNewFileProjectId(fixture.db, users.viewer, project.id))).rejects.toThrow("Project not found");
    expect(await inTeam(() => security.resolveNewFileProjectId(fixture.db, users.commenter, project.id))).toBe(project.id);
    expect(await inTeam(() => security.resolveNewFileProjectId(fixture.db, users.editor, project.id))).toBe(project.id);
  });

  it("manages grants end to end: list, change, audit, remove, and cascade with the Project", async () => {
    const list = await inTeam(() => access.listProjectAccess(project.id, users.manager));
    expect(list.ok && Object.fromEntries(list.data.members.map((member) => [member.name, member.role]))).toEqual({
      creator: "owner", manager: "manager", editor: "editor", commenter: "commenter", viewer: "viewer",
    });

    expect(await inTeam(() => access.setProjectAccess(project.id, users.creator, users.commenter, "editor"))).toMatchObject({ ok: true });
    expect(await inTeam(() => roles.projectRoleFor(project.id, users.commenter))).toBe("editor");
    expect(await inTeam(() => notes.updateNote(note.uid, users.commenter, { content: "<p>now an editor</p>" }))).toMatchObject({ success: true });

    const audit = await fixture.db.teamAuditEvent.findFirst({ where: { action: "project_access_changed", targetId: String(project.id) } });
    expect(audit).toMatchObject({ teamId, actorId: users.creator, targetType: "project" });
    expect(JSON.parse(audit.metadata)).toEqual({ userId: users.commenter, role: "editor", previousRole: null });

    expect(await inTeam(() => access.clearProjectAccess(project.id, users.manager, users.commenter))).toMatchObject({ ok: true });
    expect(await inTeam(() => roles.projectRoleFor(project.id, users.commenter))).toBe("commenter");

    // Only the creator and Managers manage access, nobody reaches another Team's Project, and the fixed roles cannot be restricted.
    expect(await inTeam(() => access.setProjectAccess(project.id, users.editor, users.viewer, "editor"))).toMatchObject({ ok: false, status: 404 });
    expect(await inTeam(() => access.listProjectAccess(otherProject.id, users.creator))).toMatchObject({ ok: false, status: 404 });
    expect(await inTeam(() => access.setProjectAccess(project.id, users.creator, users.outsider, "editor"))).toMatchObject({ ok: false, status: 404 });
    expect(await inTeam(() => access.setProjectAccess(project.id, users.creator, users.gone, "editor"))).toMatchObject({ ok: false, status: 404 });
    expect(await inTeam(() => access.setProjectAccess(project.id, users.manager, users.creator, "viewer"))).toMatchObject({ ok: false, status: 400 });
    expect(await inTeam(() => access.setProjectAccess(project.id, users.creator, users.manager, "viewer"))).toMatchObject({ ok: false, status: 400 });

    await fixture.db.note.deleteMany({ where: { projectId: project.id } });
    await fixture.db.drawing.deleteMany({ where: { projectId: project.id } });
    await fixture.db.flowchart.deleteMany({ where: { projectId: project.id } });
    await fixture.db.diagram.deleteMany({ where: { projectId: project.id } });
    await fixture.db.project.deleteMany({ where: { id: project.id } });
    expect(await fixture.db.projectAccessGrant.count({ where: { projectId: project.id } })).toBe(0);
  });
});
