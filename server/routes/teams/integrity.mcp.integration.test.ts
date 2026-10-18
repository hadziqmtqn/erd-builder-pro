import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma.js", () => ({ get prisma() { return fixture.db; } }));
// Capacity mutations must not report synthetic usage to the configured SaaS server.
vi.mock("../../lib/self-host-capacity-report.js", () => ({ reportSelfHostCapacityChange: () => {} }));

const schema = `test_sh_mcp_integrity_${randomUUID().replaceAll("-", "")}`;
const adminId = randomUUID(), memberId = randomUUID(), outsiderId = randomUUID();
const sourceId = randomUUID(), targetId = randomUUID();
const adminToken = randomUUID(), memberToken = randomUUID();
const licenseId = randomUUID();
const keys = generateKeyPairSync("ed25519");
const envKeys = ["DATABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL", "AUTH_MODE", "ERD_INSTALL_MODE", "NODE_ENV",
  "ERDBPRO_LICENSE_STATE_FILE", "ERDBPRO_INSTALLATION_IDENTITY_FILE", "ERDBPRO_LICENSE_ISSUER",
  "ERDBPRO_LICENSE_PUBLIC_KEY", "ERDBPRO_LICENSE_PUBLIC_KEY_ID"];
const originalEnv = new Map<string, string | undefined>();
let pool: pg.Pool | undefined, server: Server | undefined, created = false;
let directory = "", serverUrl = "", installationId = "";
let provisioning: typeof import("../../lib/team-provisioning.js");
let license: typeof import("../../lib/license-client.js");
let mcp: typeof import("../../mcp/public-service.js");
let files: Record<string, any>, personalNote: any;

function setLease(maxTeams: number) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const input = `${encode({ alg: "EdDSA", typ: "JWT", kid: "mcp-integrity-test" })}.${encode({
    iss: "https://license.example.test", aud: "erd-self-host-instance-license", product_type: "self_host",
    client_type: "web", installation_id: installationId, sub: licenseId, jti: randomUUID(),
    iat: now, exp: now + 3600, binding_generation: 1, organization_type: "team", plan_code: "test",
    limits: { max_teams: maxTeams, max_members: 10 }, features: ["team_files"],
  })}`;
  license.storeInstanceLicense({ installationId, clientToken: randomUUID(), licenseId,
    signedEntitlement: `${input}.${sign(null, Buffer.from(input), keys.privateKey).toString("base64url")}`,
    bindingGeneration: 1, codeLastFour: "TEST", lastCheckedAt: new Date().toISOString() });
}

async function api(method: string, pathname: string, token: string, teamId?: string, body?: unknown) {
  const response = await fetch(serverUrl + pathname, { method,
    headers: { authorization: `Bearer ${token}`, ...(teamId ? { "x-team-id": teamId } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}

async function assertMcpDenied() {
  const listed = await mcp.listPublicWorkspaceFiles(memberId);
  expect(listed.notes.map((note: any) => note.uid)).not.toContain(files.notes.uid);
  const matches = await mcp.searchPublicWorkspace(memberId, "Integrity source note", "notes");
  expect(matches.map((match: any) => match.uid)).not.toContain(files.notes.uid);
  await expect(mcp.listPublicWorkspaceFiles(memberId, String(files.notes.projectId))).rejects.toThrow("Project not found");
  for (const type of ["notes", "drawings", "flowcharts", "diagrams"] as const) {
    await expect(mcp.readPublicDocument(memberId, type, files[type].uid)).rejects.toThrow("Document not found");
  }
  await expect(mcp.listPublicHistory(memberId, "notes", files.notes.uid, 5)).rejects.toThrow("Document not found");
  await expect(mcp.readPublicHistory(memberId, "notes", files.notes.uid, "1")).rejects.toThrow("Document not found");
}

async function assertOriginalsRetained() {
  for (const [type, model] of [["notes", "note"], ["drawings", "drawing"], ["flowcharts", "flowchart"], ["diagrams", "diagram"]]) {
    expect(await fixture.db[model].findUnique({ where: { id: files[type].id } })).toEqual(files[type]);
  }
}

describe.skipIf(process.env.TEAM_RECOVERY_INTEGRATION !== "1")("SH-002 API and MCP integrity recovery (isolated PostgreSQL)", () => {
  beforeAll(async () => {
    for (const key of envKeys) originalEnv.set(key, process.env[key]);
    dotenv.config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("Only a localhost disposable schema is allowed.");
    directory = mkdtempSync(path.join(tmpdir(), "erd-mcp-integrity-"));
    Object.assign(process.env, { NODE_ENV: "test", ERD_INSTALL_MODE: "web", AUTH_MODE: "", SUPABASE_URL: "", VITE_SUPABASE_URL: "",
      ERDBPRO_LICENSE_STATE_FILE: path.join(directory, "license-state.json"),
      ERDBPRO_INSTALLATION_IDENTITY_FILE: path.join(directory, "installation-identity.json"),
      ERDBPRO_LICENSE_ISSUER: "https://license.example.test", ERDBPRO_LICENSE_PUBLIC_KEY_ID: "mcp-integrity-test",
      ERDBPRO_LICENSE_PUBLIC_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString() });
    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    created = true;
    const sql = execFileSync(process.execPath, [path.resolve("node_modules/prisma/build/index.js"), "migrate", "diff",
      "--from-empty", "--to-schema", "prisma/schema.pg.prisma", "--script"],
    { encoding: "utf8", env: { ...process.env, DB_VARIANT: "pg" }, stdio: ["ignore", "pipe", "ignore"] });
    const connection = await pool.connect();
    try {
      await connection.query(`SET search_path TO "${schema}"`);
      await connection.query(sql.replaceAll('"public"', `"${schema}"`));
    } finally { connection.release(); }
    const { PrismaClient } = createRequire(import.meta.url)("@erdbpro/prisma-pg-local");
    fixture.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 4 }, { schema }) });
    const [identity, lease, signatures, service, teamsRouter, notesRouter] = await Promise.all([
      import("../../lib/installation-identity.js"), import("../../lib/license-client.js"), import("../../lib/team-provisioning.js"),
      import("../../mcp/public-service.js"), import("./index.js"), import("../notes/index.js"),
    ]);
    installationId = identity.ensureInstallationIdentity().installationId;
    license = lease; provisioning = signatures; mcp = service;
    const app = express();
    app.use(express.json(), cookieParser());
    app.use("/api/teams", teamsRouter.default);
    app.use("/api/notes", notesRouter.default);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not bind.");
    serverUrl = `http://127.0.0.1:${address.port}`;
  }, 30000);

  beforeEach(async () => {
    for (const model of ["entityChange", "diagram", "note", "drawing", "flowchart", "project", "teamAuditEvent", "session", "teamMember", "team", "user"]) {
      await fixture.db[model].deleteMany();
    }
    setLease(2);
    await fixture.db.user.createMany({ data: [
      { id: adminId, email: "admin@example.test", password: "fixture-only", isSuperAdmin: true },
      { id: memberId, email: "member@example.test", password: "fixture-only" },
      { id: outsiderId, email: "outsider@example.test", password: "fixture-only" },
    ] });
    for (const id of [sourceId, targetId]) {
      const team = { id, status: "active", createdAt: new Date() };
      await fixture.db.team.create({ data: { ...team, name: id, provisioningSignature: provisioning.teamProvisioningSignature(team) } });
      const membership = { id: randomUUID(), teamId: id, userId: memberId, role: "staff", status: "active", joinedAt: new Date() };
      await fixture.db.teamMember.create({ data: { ...membership, provisioningSignature: provisioning.membershipProvisioningSignature(membership) } });
    }
    await fixture.db.session.createMany({ data: [
      { token: adminToken, userId: adminId, email: "admin@example.test" },
      { token: memberToken, userId: memberId, email: "member@example.test" },
    ] });
    const project = await fixture.db.project.create({ data: { teamId: sourceId, userId: adminId, name: "Integrity source" } });
    files = {
      notes: await fixture.db.note.create({ data: { uid: randomUUID(), projectId: project.id, userId: adminId, title: "Integrity source note", content: "<p>Retain me</p>" } }),
      drawings: await fixture.db.drawing.create({ data: { uid: randomUUID(), projectId: project.id, userId: adminId, title: "Drawing", data: '{"elements":[]}' } }),
      flowcharts: await fixture.db.flowchart.create({ data: { uid: randomUUID(), projectId: project.id, userId: adminId, title: "Flowchart", data: '{"nodes":[],"edges":[]}' } }),
      diagrams: await fixture.db.diagram.create({ data: { projectId: project.id, userId: adminId, uid: randomUUID(), name: "ERD" } }),
    };
    personalNote = await fixture.db.note.create({ data: { uid: randomUUID(), userId: memberId, title: "Personal", content: "<p>Private</p>" } });
    expect(await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).toMatchObject({ status: 200 });
    expect(await mcp.readPublicDocument(memberId, "notes", files.notes.uid)).toMatchObject({ content: files.notes.content });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await fixture.db?.$disconnect();
    if (created) {
      await pool!.query(`DROP SCHEMA "${schema}" CASCADE`);
      expect((await pool!.query("SELECT nspname FROM pg_namespace WHERE nspname=$1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
    if (directory) rmSync(directory, { recursive: true, force: true });
    for (const [key, value] of originalEnv) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });

  it("rejects a manual Team signature and recovers four retained files without granting the source access", async () => {
    await fixture.db.team.update({ where: { id: sourceId }, data: { provisioningSignature: "manual-invalid" } });
    expect((await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).status).toBe(404);
    expect((await api("GET", `/api/notes/${files.notes.uid}`, adminToken, sourceId)).status).toBe(404);
    await assertMcpDenied();
    expect((await api("POST", `/api/teams/${sourceId}/integrity/quarantine`, adminToken)).status).toBe(200);
    const input = { operationId: randomUUID(), targetTeamId: targetId, files: [
      { type: "notes", id: files.notes.id }, { type: "drawings", id: files.drawings.id },
      { type: "flowchart", id: files.flowcharts.id }, { type: "erd", id: files.diagrams.id },
    ] };
    const [copy, replay] = await Promise.all([
      api("POST", `/api/teams/${sourceId}/recovery`, adminToken, undefined, input),
      api("POST", `/api/teams/${sourceId}/recovery`, adminToken, undefined, input),
    ]);
    expect(copy.status).toBe(200);
    expect(replay.body).toEqual(copy.body);
    expect(copy.body).toMatchObject({ fileCount: 4, projectCount: 1 });
    for (const item of copy.body.items) {
      const type = item.type === "erd" ? "diagrams" : item.type === "flowchart" ? "flowcharts" : item.type;
      expect(await mcp.readPublicDocument(memberId, type, item.copiedUid)).toMatchObject({ uid: item.copiedUid });
    }
    const note = copy.body.items.find((item: any) => item.type === "notes");
    expect((await api("GET", `/api/notes/${note.copiedUid}`, memberToken, targetId)).status).toBe(200);
    await assertMcpDenied();
    await assertOriginalsRetained();
    expect(await fixture.db.teamAuditEvent.count({ where: { action: "files_recovered" } })).toBe(1);
    expect(await fixture.db.team.findUnique({ where: { id: sourceId } })).toMatchObject({ status: "quarantined", provisioningSignature: "manual-invalid" });
  });

  it("blocks every member when a manual membership is inserted, then restores access after quarantine", async () => {
    await fixture.db.teamMember.create({ data: { teamId: sourceId, userId: outsiderId, role: "staff", status: "active", provisioningSignature: "manual-invalid" } });
    expect((await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).status).toBe(404);
    expect((await api("GET", `/api/notes/${files.notes.uid}`, adminToken, sourceId)).status).toBe(404);
    await assertMcpDenied();
    expect((await api("POST", `/api/teams/${sourceId}/members/${outsiderId}/integrity/quarantine`, adminToken)).status).toBe(200);
    expect((await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).status).toBe(200);
    expect(await mcp.readPublicDocument(memberId, "notes", files.notes.uid)).toMatchObject({ content: files.notes.content });
    await assertOriginalsRetained();
    expect(await fixture.db.teamMember.findUnique({ where: { teamId_userId: { teamId: sourceId, userId: outsiderId } } })).toMatchObject({ status: "quarantined", provisioningSignature: "manual-invalid" });
  });

  it("denies over-capacity Team reads and restores them by reducing active usage without deleting documents", async () => {
    setLease(1);
    expect((await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).body.code).toBe("INSTANCE_CAPACITY_EXCEEDED");
    expect((await api("GET", `/api/notes/${files.notes.uid}`, adminToken, sourceId)).status).toBe(404);
    await assertMcpDenied();
    expect(await mcp.readPublicDocument(memberId, "notes", personalNote.uid)).toMatchObject({ content: personalNote.content });
    expect((await api("PATCH", `/api/teams/${targetId}/status`, adminToken, undefined, { status: "inactive" })).status).toBe(200);
    expect((await api("GET", `/api/notes/${files.notes.uid}`, memberToken, sourceId)).status).toBe(200);
    expect(await mcp.readPublicDocument(memberId, "notes", files.notes.uid)).toMatchObject({ content: files.notes.content });
    await assertOriginalsRetained();
    expect(await fixture.db.team.count()).toBe(2);
    expect(await fixture.db.teamMember.count()).toBe(2);
  });
});
