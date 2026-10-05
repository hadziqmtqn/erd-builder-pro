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
const schema = `test_sh_recovery_assets_${randomUUID().replaceAll("-", "")}`;
const adminId = randomUUID(), staffId = randomUUID(), personalId = randomUUID();
const otherMemberId = randomUUID();
const sourceId = randomUUID(), destinationId = randomUUID(), otherId = randomUUID();
const operationId = randomUUID();
const noteKey = "erd-builder-pro/notes/recovered.png";
const drawingKey = "erd-builder-pro/drawings/recovered.png";
const assets = new Map<string, Buffer>([
  [noteKey, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/SxkAAAAASUVORK5CYII=", "base64")],
  [drawingKey, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64")],
]);
const envKeys = [
  "DATABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL", "AUTH_MODE", "ERD_INSTALL_MODE", "NODE_ENV",
  "ERDBPRO_LICENSE_STATE_FILE", "ERDBPRO_INSTALLATION_IDENTITY_FILE", "ERDBPRO_LICENSE_ISSUER",
  "ERDBPRO_LICENSE_PUBLIC_KEY", "ERDBPRO_LICENSE_PUBLIC_KEY_ID", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME", "R2_PUBLIC_URL",
];
const previousEnv = new Map<string, string | undefined>();
let temporaryDirectory = "", adminToken = "", staffToken = "", personalToken = "", otherToken = "", serverUrl = "";
let pool: pg.Pool | null = null, server: Server | null = null, schemaCreated = false;
let dbTeam: any, licenseClient: any;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedInstanceEntitlement(installationId: string, privateKey: KeyObject): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "EdDSA", typ: "JWT", kid: "recovery-assets-test" });
  const claims = encode({
    iss: "https://license.example.test", aud: "erd-self-host-instance-license", product_type: "self_host",
    client_type: "web", installation_id: installationId, sub: randomUUID(), jti: randomUUID(),
    iat: now, exp: now + 3600, binding_generation: 2, organization_type: "team", plan_code: "test-team",
    limits: { max_members: 10, max_teams: 10 }, features: ["team_files"],
  });
  const input = `${header}.${claims}`;
  return `${input}.${sign(null, Buffer.from(input), privateKey).toString("base64url")}`;
}

async function jsonApi(method: string, pathname: string, token?: string, teamId?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (teamId) headers["x-team-id"] = teamId;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${serverUrl}${pathname}`, {
    method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function assetApi(key: string, token: string, teamId?: string) {
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (teamId) headers["x-team-id"] = teamId;
  const response = await fetch(`${serverUrl}/api/serve/${key}`, { headers });
  return {
    status: response.status,
    contentType: response.headers.get("content-type")?.split(";")[0],
    bytes: Buffer.from(await response.arrayBuffer()),
  };
}

function restoreEnvironment() {
  for (const [key, value] of previousEnv) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe.skipIf(!enabled)("SH-003 recovered asset access through authenticated storage proxy", () => {
  beforeAll(async () => {
    for (const key of envKeys) previousEnv.set(key, process.env[key]);
    dotenv.config({ quiet: true });
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erd-recovery-assets-"));
    process.env.NODE_ENV = "test";
    process.env.ERD_INSTALL_MODE = "web";
    process.env.SUPABASE_URL = "";
    process.env.VITE_SUPABASE_URL = "";
    process.env.AUTH_MODE = "";
    for (const key of envKeys.filter((name) => name.startsWith("R2_"))) process.env[key] = "";
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(temporaryDirectory, "license-state.json");
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(temporaryDirectory, "installation-identity.json");

    const databaseUrl = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(databaseUrl.hostname)) {
      throw new Error("Recovery asset integration requires a localhost PostgreSQL URL.");
    }
    pool = new pg.Pool({ connectionString: databaseUrl.toString(), max: 2 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const migrationSql = execFileSync(process.execPath, [
      path.resolve("node_modules/prisma/build/index.js"), "migrate", "diff", "--from-empty", "--to-schema", "prisma/schema.pg.prisma", "--script",
    ], { encoding: "utf8", env: { ...process.env, DB_VARIANT: "pg" }, stdio: ["ignore", "pipe", "ignore"] });
    const connection = await pool.connect();
    try {
      await connection.query(`SET search_path TO "${schema}"`);
      await connection.query(migrationSql.replaceAll('"public"', `"${schema}"`));
    } finally { connection.release(); }

    const require = createRequire(import.meta.url);
    const { PrismaClient } = require("@erdbpro/prisma-pg-local");
    fixture.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.toString(), max: 4 }, { schema }) });
    const [identity, license, provisioning, teamsRouter, commonRouter] = await Promise.all([
      import("../../lib/installation-identity.js"), import("../../lib/license-client.js"),
      import("../../lib/team-provisioning.js"), import("./index.js"), import("../common/index.js"),
    ]);
    licenseClient = license;
    const localIdentity = identity.ensureInstallationIdentity();
    const issuerKeys = generateKeyPairSync("ed25519");
    process.env.ERDBPRO_LICENSE_ISSUER = "https://license.example.test";
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY = issuerKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = "recovery-assets-test";
    licenseClient.storeInstanceLicense({
      installationId: localIdentity.installationId, clientToken: randomUUID(),
      signedEntitlement: signedInstanceEntitlement(localIdentity.installationId, issuerKeys.privateKey),
      licenseId: randomUUID(), bindingGeneration: 2, codeLastFour: "TEST", lastCheckedAt: new Date().toISOString(),
    });
    dbTeam = provisioning;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/teams", teamsRouter.default);
    app.use("/api", commonRouter.default);
    // Local S3-compatible fixture: only the two in-memory objects below exist.
    app.use((req, res, next) => {
      const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
      const prefix = "/fixture-assets/";
      if (req.method !== "GET" || !pathname.startsWith(prefix)) { next(); return; }
      const bytes = assets.get(decodeURIComponent(pathname.slice(prefix.length)));
      if (!bytes) { res.status(404).end(); return; }
      res.status(200).type("image/png").set("Content-Length", String(bytes.length)).end(bytes);
    });
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Recovery asset fixture failed to bind localhost.");
    serverUrl = `http://127.0.0.1:${address.port}`;

    const createTeam = async (id: string, name: string, status: string) => {
      const createdAt = new Date();
      const data = { id, status, createdAt };
      return fixture.db.team.create({ data: {
        ...data, name, type: "team",
        provisioningSignature: status === "quarantined" ? "invalid" : dbTeam.teamProvisioningSignature(data),
      } });
    };
    await fixture.db.user.createMany({ data: [
      { id: adminId, email: "asset-admin@example.test", password: "fixture-only", isSuperAdmin: true },
      { id: staffId, email: "asset-staff@example.test", password: "fixture-only", isSuperAdmin: false },
      { id: personalId, email: "asset-personal@example.test", password: "fixture-only", isSuperAdmin: false },
      { id: otherMemberId, email: "asset-other@example.test", password: "fixture-only", isSuperAdmin: false },
    ] });
    await createTeam(sourceId, "Quarantined source", "quarantined");
    await createTeam(destinationId, "Active destination", "active");
    await createTeam(otherId, "Other active Team", "active");
    const members = [
      { id: randomUUID(), teamId: destinationId, userId: staffId, role: "staff", status: "active", joinedAt: new Date() },
      { id: randomUUID(), teamId: otherId, userId: otherMemberId, role: "staff", status: "active", joinedAt: new Date() },
    ];
    await fixture.db.teamMember.createMany({ data: members.map((member) => ({
      ...member, provisioningSignature: dbTeam.membershipProvisioningSignature(member),
    })) });
    adminToken = randomUUID(); staffToken = randomUUID(); personalToken = randomUUID();
    otherToken = randomUUID();
    await fixture.db.session.createMany({ data: [
      { token: adminToken, userId: adminId, email: "asset-admin@example.test", name: "Admin" },
      { token: staffToken, userId: staffId, email: "asset-staff@example.test", name: "Staff" },
      { token: personalToken, userId: personalId, email: "asset-personal@example.test", name: "Personal" },
      { token: otherToken, userId: otherMemberId, email: "asset-other@example.test", name: "Other Staff" },
    ] });
    await fixture.db.userPreference.create({ data: {
      userId: staffId,
      storageConfig: JSON.stringify({
        type: "s3-compatible", endpoint: serverUrl, region: "us-east-1", accessKeyId: "fixture-only",
        secretAccessKey: "fixture-only", bucketName: "fixture-assets",
      }),
    } });

    const project = await fixture.db.project.create({ data: { name: "Source project", teamId: sourceId, userId: adminId } });
    const note = await fixture.db.note.create({ data: {
      title: "Recovered note", content: `<p>Note<img src="/api/serve/${noteKey}?token=source-secret"></p>`, projectId: project.id, userId: adminId,
    } });
    const drawing = await fixture.db.drawing.create({ data: {
      title: "Recovered drawing", data: JSON.stringify({ elements: [], files: { image: { dataURL: `/api/serve/${drawingKey}?token=source-secret` } } }),
      projectId: project.id, userId: adminId,
    } });
    const result = await jsonApi("POST", `/api/teams/${sourceId}/recovery`, adminToken, undefined, {
      operationId, targetTeamId: destinationId,
      files: [{ type: "notes", id: note.id }, { type: "drawings", id: drawing.id }],
    });
    if (result.status !== 200) throw new Error(`Fixture recovery failed with HTTP ${result.status}.`);
  }, 30000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await fixture.db?.$disconnect();
    if (schemaCreated && pool) {
      await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
      expect((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    restoreEnvironment();
  });

  it("streams recovered image bytes only to the active destination member", async () => {
    const copiedNote = await fixture.db.note.findFirst({ where: { project: { teamId: destinationId } } });
    const copiedDrawing = await fixture.db.drawing.findFirst({ where: { project: { teamId: destinationId } } });
    expect(copiedNote.content).not.toContain("source-secret");
    expect(copiedDrawing.data).not.toContain("source-secret");

    for (const [key, expected] of [[noteKey, assets.get(noteKey)!], [drawingKey, assets.get(drawingKey)!]] as const) {
      const received = await assetApi(key, staffToken, destinationId);
      expect(received.status).toBe(200);
      expect(received.contentType).toBe("image/png");
      expect(received.bytes).toEqual(expected);
    }

    expect((await assetApi(noteKey, otherToken)).status).toBe(404);
    expect((await assetApi(drawingKey, otherToken)).status).toBe(404);
    expect((await assetApi(noteKey, personalToken)).status).toBe(404);
    expect((await assetApi(drawingKey, personalToken)).status).toBe(404);
  });
});
