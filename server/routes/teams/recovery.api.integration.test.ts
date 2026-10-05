import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import express from "express";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ db: null as any }));
vi.mock("../../lib/prisma.js", () => ({ get prisma() { return fixture.db; } }));

const enabled = process.env.TEAM_RECOVERY_INTEGRATION === "1";
const schema = "test_sh_recovery_api_" + randomUUID().replaceAll("-", "");
const superAdminId = randomUUID();
const staffId = randomUUID();
const sourceTeamId = randomUUID();
const destinationTeamId = randomUUID();
const otherTeamId = randomUUID();
const operationId = randomUUID();
let adminToken = "", staffToken = "";
let sourceFiles: Record<string, any> = {};
const envKeys = [
  "DATABASE_URL",
  "SUPABASE_URL",
  "VITE_SUPABASE_URL",
  "AUTH_MODE",
  "ERD_INSTALL_MODE",
  "NODE_ENV",
  "ERDBPRO_LICENSE_STATE_FILE",
  "ERDBPRO_INSTALLATION_IDENTITY_FILE",
  "ERDBPRO_LICENSE_ISSUER",
  "ERDBPRO_LICENSE_PUBLIC_KEY",
  "ERDBPRO_LICENSE_PUBLIC_KEY_ID",
];
let originalEnvironment = new Map<string, string | undefined>();
let temporaryDirectory = "";
let pool: pg.Pool | null = null;
let server: Server | null = null;
let serverUrl = "", schemaCreated = false;
let teamProvisioning: any;
let installationIdentity: any;
let licenseClient: any;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedInstanceEntitlement(installationId: string, privateKey: KeyObject): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "EdDSA", typ: "JWT", kid: "recovery-api-test" });
  const claims = encode({
    iss: "https://license.example.test",
    aud: "erd-self-host-instance-license",
    product_type: "self_host",
    client_type: "web",
    installation_id: installationId,
    sub: randomUUID(),
    jti: randomUUID(),
    iat: now,
    exp: now + 3600,
    binding_generation: 2,
    organization_type: "team",
    plan_code: "test-team",
    limits: { max_members: 10, max_teams: 10 },
    features: ["team_files"],
  });
  const signingInput = header + "." + claims;
  return signingInput + "." + sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
}

async function callApi(
  method: string,
  pathname: string,
  token?: string,
  teamId?: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = "Bearer " + token;
  if (teamId) headers["x-team-id"] = teamId;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetch(serverUrl + pathname, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();

  return { status: response.status, body: text === "" ? null : JSON.parse(text) };
}

async function closeServer(): Promise<void> {
  if (!server) return;
  const activeServer = server;
  server = null;
  await new Promise<void>((resolve, reject) => {
    activeServer.close((error) => error ? reject(error) : resolve());
  });
}

function restoreEnvironment(): void {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe.skipIf(!enabled)("SH-003 authenticated recovery API", () => {
  beforeAll(async () => {
    originalEnvironment = new Map(envKeys.map((key) => [key, process.env[key]]));
    dotenv.config({ quiet: true });
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erd-recovery-api-"));
    process.env.NODE_ENV = "test";
    process.env.ERD_INSTALL_MODE = "web";
    process.env.SUPABASE_URL = "";
    process.env.VITE_SUPABASE_URL = "";
    delete process.env.AUTH_MODE;
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(temporaryDirectory, "license-state.json");
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(temporaryDirectory, "installation-identity.json");

    const databaseUrl = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)) {
      throw new Error("Recovery API integration requires a localhost PostgreSQL URL.");
    }

    pool = new pg.Pool({ connectionString: databaseUrl.toString(), max: 2 });
    await pool.query("CREATE SCHEMA \"" + schema + "\"");
    schemaCreated = true;
    const migrationSql = execFileSync(process.execPath, [
      path.resolve("node_modules/prisma/build/index.js"),
      "migrate",
      "diff",
      "--from-empty",
      "--to-schema",
      "prisma/schema.pg.prisma",
      "--script",
    ], {
      encoding: "utf8",
      env: { ...process.env, DB_VARIANT: "pg" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const connection = await pool.connect();
    try {
      await connection.query("SET search_path TO \"" + schema + "\"");
      await connection.query(migrationSql.replaceAll('"public"', "\"" + schema + "\""));
    } finally {
      connection.release();
    }

    const require = createRequire(import.meta.url);
    const { PrismaClient } = require("@erdbpro/prisma-pg-local");
    fixture.db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl.toString(), max: 4 }, { schema }),
    });

    [installationIdentity, licenseClient, teamProvisioning] = await Promise.all([
      import("../../lib/installation-identity.js"),
      import("../../lib/license-client.js"),
      import("../../lib/team-provisioning.js"),
    ]);
    const identity = installationIdentity.ensureInstallationIdentity();
    const signingKeys = generateKeyPairSync("ed25519");
    process.env.ERDBPRO_LICENSE_ISSUER = "https://license.example.test";
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY = signingKeys.publicKey.export({
      type: "spki",
      format: "pem",
    }).toString();
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = "recovery-api-test";
    licenseClient.storeInstanceLicense({
      installationId: identity.installationId,
      clientToken: randomUUID(),
      signedEntitlement: signedInstanceEntitlement(identity.installationId, signingKeys.privateKey),
      licenseId: randomUUID(),
      bindingGeneration: 2,
      codeLastFour: "TEST",
      lastCheckedAt: new Date().toISOString(),
    });

    const [teamsRouter, diagramsRouter, notesRouter, drawingsRouter, flowchartsRouter] = await Promise.all([
      import("./index.js"),
      import("../diagrams/index.js"),
      import("../notes/index.js"),
      import("../drawings/index.js"),
      import("../flowcharts/index.js"),
    ]);
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/teams", teamsRouter.default);
    app.use("/api/diagrams", diagramsRouter.default);
    app.use("/api/notes", notesRouter.default);
    app.use("/api/drawings", drawingsRouter.default);
    app.use("/api/flowcharts", flowchartsRouter.default);
    const activeServer = app.listen(0, "127.0.0.1");
    server = activeServer;
    await new Promise<void>((resolve, reject) => {
      activeServer.once("listening", resolve);
      activeServer.once("error", reject);
    });
    const address = activeServer.address();
    if (!address || typeof address === "string") throw new Error("Recovery API test server did not bind.");
    serverUrl = "http://127.0.0.1:" + address.port;
    const createdAt = new Date("2026-10-05T12:00:00.000Z");
    await fixture.db.user.createMany({
      data: [
        { id: superAdminId, email: "recovery-admin@example.test", password: "fixture-only", isSuperAdmin: true },
        { id: staffId, email: "recovery-staff@example.test", password: "fixture-only", isSuperAdmin: false },
      ],
    });
    const createTeam = async (id: string, name: string, status: string) => {
      const team = { id, status, createdAt };
      const provisioningSignature = teamProvisioning.teamProvisioningSignature(team);
      return fixture.db.team.create({
        data: { ...team, name, type: "team", provisioningSignature },
      });
    };
    await createTeam(sourceTeamId, "Quarantined source", "quarantined");
    await createTeam(destinationTeamId, "Verified destination", "active");
    await createTeam(otherTeamId, "Unassigned Team", "active");

    const joinedAt = new Date("2026-10-05T12:10:00.000Z");
    const membership = {
      id: randomUUID(),
      teamId: destinationTeamId,
      userId: staffId,
      role: "staff",
      status: "active",
      joinedAt,
    };
    await fixture.db.teamMember.create({
      data: {
        ...membership,
        provisioningSignature: teamProvisioning.membershipProvisioningSignature(membership),
      },
    });
    adminToken = randomUUID();
    staffToken = randomUUID();
    await fixture.db.session.createMany({
      data: [
        { token: adminToken, userId: superAdminId, email: "recovery-admin@example.test", name: "Recovery Admin" },
        { token: staffToken, userId: staffId, email: "recovery-staff@example.test", name: "Recovery Staff" },
      ],
    });
    const project = await fixture.db.project.create({
      data: { name: "Retained project", teamId: sourceTeamId, userId: superAdminId },
    });
    sourceFiles = {
      erd: await fixture.db.diagram.create({
        data: {
          name: "Database",
          projectId: project.id,
          userId: superAdminId,
          uid: randomUUID(),
          isPublic: true,
          publicAccess: "link",
          shareToken: "source-share-token",
        },
      }),
      notes: await fixture.db.note.create({
        data: {
          title: "Notes",
          content: '<p>Recovery note <img src="/api/serve/erd-builder-pro/notes/image.png?token=source-secret"></p>',
          projectId: project.id,
          userId: superAdminId,
        },
      }),
      drawings: await fixture.db.drawing.create({
        data: {
          title: "Drawing",
          data: JSON.stringify({ elements: [], files: { image: { dataURL: "/api/serve/erd-builder-pro/drawings/image.png?token=source-secret" } } }),
          projectId: project.id,
          userId: superAdminId,
        },
      }),
      flowchart: await fixture.db.flowchart.create({
        data: { title: "Flowchart", data: '{"nodes":[],"edges":[]}', projectId: project.id, userId: superAdminId },
      }),
    };
  }, 30000);

  afterAll(async () => {
    await closeServer();
    await fixture.db?.$disconnect();
    if (schemaCreated && pool) {
      await pool.query("DROP SCHEMA \"" + schema + "\" CASCADE");
      expect((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    restoreEnvironment();
  });

  it("recovers as SuperAdmin and lets only an authenticated destination Staff read the copies", async () => {
    const unauthenticated = await callApi("GET", "/api/teams/" + sourceTeamId + "/recovery");
    expect(unauthenticated.status).toBe(401);
    const staffInventory = await callApi(
      "GET",
      "/api/teams/" + sourceTeamId + "/recovery",
      staffToken,
      destinationTeamId,
    );
    expect(staffInventory.status).toBe(403);
    const input = {
      operationId,
      targetTeamId: destinationTeamId,
      files: [
        { type: "erd", id: sourceFiles.erd.id },
        { type: "notes", id: sourceFiles.notes.id },
        { type: "drawings", id: sourceFiles.drawings.id },
        { type: "flowchart", id: sourceFiles.flowchart.id },
      ],
    };
    const staffRecovery = await callApi(
      "POST",
      "/api/teams/" + sourceTeamId + "/recovery",
      staffToken,
      destinationTeamId,
      input,
    );
    expect(staffRecovery.status).toBe(403);
    expect(staffRecovery.body.code).toBe("SUPER_ADMIN_REQUIRED");
    expect(await fixture.db.project.count({ where: { teamId: destinationTeamId } })).toBe(0);
    expect(await fixture.db.teamAuditEvent.count()).toBe(0);
    const postRecovery = () => callApi(
      "POST",
      "/api/teams/" + sourceTeamId + "/recovery",
      adminToken,
      undefined,
      input,
    );
    const [recovered, replay] = await Promise.all([postRecovery(), postRecovery()]);
    expect(recovered.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(recovered.body).toMatchObject({ fileCount: 4, projectCount: 1, targetTeamId: destinationTeamId });
    expect(recovered.body.items).toHaveLength(4);
    expect(replay.body).toEqual(recovered.body);
    expect(await fixture.db.project.count({ where: { teamId: destinationTeamId } })).toBe(1);
    expect(await fixture.db.teamAuditEvent.count({ where: { action: "files_recovered" } })).toBe(1);
    const copiedUids = new Map<string, string>(
      recovered.body.items.map((item: { type: string; copiedUid: string }) => [item.type, item.copiedUid]),
    );
    const destinations = [
      { type: "erd", route: "diagrams" },
      { type: "notes", route: "notes" },
      { type: "drawings", route: "drawings" },
      { type: "flowchart", route: "flowcharts" },
    ];
    const readResults: { type: string; uid: string; result: { status: number; body: any } }[] = [];
    for (const { type, route } of destinations) {
      const uid = copiedUids.get(type)!;
      const result = await callApi(
        "GET",
        "/api/" + route + "/" + uid,
        staffToken,
        destinationTeamId,
      );
      readResults.push({ type, uid, result });
    }

    for (const { uid, result } of readResults) {
      expect(result.status).toBe(200);
      expect(result.body.uid).toBe(uid);
    }
    const recoveredNote = readResults.find((entry) => entry.type === "notes")?.result.body;
    const recoveredDrawing = readResults.find((entry) => entry.type === "drawings")?.result.body;
    expect(recoveredNote.content).toContain("/api/serve/erd-builder-pro/notes/image.png");
    expect(recoveredDrawing.data).toContain("/api/serve/erd-builder-pro/drawings/image.png");

    const personalRead = await callApi(
      "GET",
      "/api/notes/" + copiedUids.get("notes"),
      staffToken,
    );
    const sourceTeamRead = await callApi(
      "GET",
      "/api/notes/" + copiedUids.get("notes"),
      staffToken,
      sourceTeamId,
    );
    const unassignedTeamRead = await callApi(
      "GET",
      "/api/notes/" + copiedUids.get("notes"),
      staffToken,
      otherTeamId,
    );
    expect(personalRead.status).toBe(404);
    expect(sourceTeamRead.status).toBe(404);
    expect(sourceTeamRead.body).toEqual(unassignedTeamRead.body);
    expect(await fixture.db.team.findUnique({ where: { id: sourceTeamId }, select: { status: true } }))
      .toMatchObject({ status: "quarantined" });
  });
});
