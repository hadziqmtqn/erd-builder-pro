import { generateKeyPairSync, randomUUID, sign, type KeyObject } from "node:crypto";
import { createRequire } from "node:module";
import type { Server } from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import dotenv from "dotenv";
import express from "express";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  db: null as any,
}));
vi.mock("../../lib/prisma.js", () => ({ get prisma() { return fixture.db; } }));
vi.mock("../../lib/cloud-live-sync.js", () => ({ publishCloudWorkspaceSync: vi.fn().mockResolvedValue(undefined) }));

const enabled = process.env.TEAM_DISCUSSION_INTEGRATION === "1";
const schema = "test_comment_concurrency_" + randomUUID().replaceAll("-", "");
const teamId = randomUUID();
const otherTeamId = randomUUID();
const memberIds = [randomUUID(), randomUUID()];
const originalEnvKeys = [
  "DATABASE_URL", "SUPABASE_URL", "VITE_SUPABASE_URL", "AUTH_MODE", "ERD_INSTALL_MODE", "NODE_ENV",
  "ERDBPRO_LICENSE_STATE_FILE", "ERDBPRO_INSTALLATION_IDENTITY_FILE", "ERDBPRO_LICENSE_ISSUER",
  "ERDBPRO_LICENSE_PUBLIC_KEY", "ERDBPRO_LICENSE_PUBLIC_KEY_ID",
];
let originalEnvironment = new Map<string, string | undefined>();
let temporaryDirectory = "";
let pool: pg.Pool | null = null;
let server: Server | null = null;
let schemaCreated = false;
let projectId = 0;
let otherProjectId = 0;
let diagramId = 0;
let diagramUid = "";
let anchorId = "";
let serverUrl = "";
let sessionTokens: string[] = [];

function actorHeaders(index: number, activeTeamId = teamId): Record<string, string> {
  return {
    authorization: "Bearer " + sessionTokens[index],
    "x-team-id": activeTeamId,
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedInstanceEntitlement(installationId: string, privateKey: KeyObject): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "EdDSA", typ: "JWT", kid: "discussion-test-key" });
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
  const input = header + "." + claims;
  return input + "." + sign(null, Buffer.from(input), privateKey).toString("base64url");
}

describe.skipIf(!enabled)("COL-003 licensed PostgreSQL comment scope and concurrency", () => {
  beforeAll(async () => {
    originalEnvironment = new Map(originalEnvKeys.map((key) => [key, process.env[key]]));
    dotenv.config({ quiet: true });
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erd-comment-concurrency-"));
    process.env.NODE_ENV = "test";
    process.env.SUPABASE_URL = "";
    process.env.VITE_SUPABASE_URL = "";
    process.env.ERD_INSTALL_MODE = "web";
    delete process.env.AUTH_MODE;
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(temporaryDirectory, "license-state.json");
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(temporaryDirectory, "installation-identity.json");

    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) {
      throw new Error("Comment concurrency integration requires a localhost PostgreSQL URL.");
    }
    const adapterUrl = new URL(url.toString());
    adapterUrl.searchParams.set("options", "-c search_path=" + schema);
    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
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
      adapter: new PrismaPg({ connectionString: adapterUrl.toString(), max: 4 }, { schema }),
    });
    const [identity, licenseClient, teamProvisioning, desktopAuth, middleware, discussions] = await Promise.all([
      import("../../lib/installation-identity.js"),
      import("../../lib/license-client.js"),
      import("../../lib/team-provisioning.js"),
      import("../../lib/desktop-auth.js"),
      import("../../lib/middleware.js"),
      import("./discussions.js"),
    ]);
    const installation = identity.ensureInstallationIdentity();
    const licenseKeys = generateKeyPairSync("ed25519");
    process.env.ERDBPRO_LICENSE_ISSUER = "https://license.example.test";
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY = licenseKeys.publicKey.export({
      type: "spki",
      format: "pem",
    }).toString();
    process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = "discussion-test-key";
    licenseClient.storeInstanceLicense({
      installationId: installation.installationId,
      clientToken: randomUUID(),
      signedEntitlement: signedInstanceEntitlement(installation.installationId, licenseKeys.privateKey),
      licenseId: randomUUID(),
      bindingGeneration: 2,
      codeLastFour: "TEST",
      lastCheckedAt: new Date().toISOString(),
    });

    const createdAt = new Date("2026-10-05T12:00:00.000Z");
    const createTeam = async (id: string, name: string) => {
      const team = { id, status: "active", createdAt };
      await fixture.db.team.create({
        data: {
          ...team,
          name,
          type: "team",
          provisioningSignature: teamProvisioning.teamProvisioningSignature(team),
        },
      });
    };
    await createTeam(teamId, "Concurrent comments");
    await createTeam(otherTeamId, "Other Team");
    const users = await Promise.all(memberIds.map((id, index) => fixture.db.user.create({
      data: { id, email: "comment-" + index + "@example.test", name: "Commenter " + index, password: "fixture-only", isSuperAdmin: false },
    })));
    const joinedAt = new Date("2026-10-05T12:10:00.000Z");
    await Promise.all(users.map((user) => {
      const member = { id: randomUUID(), teamId, userId: user.id, role: "staff", status: "active", joinedAt };
      return fixture.db.teamMember.create({
        data: {
          ...member,
          provisioningSignature: teamProvisioning.membershipProvisioningSignature(member),
        },
      });
    }));
    sessionTokens = await Promise.all(users.map((user) => desktopAuth.createSession(user.id, user.email, user.name)));
    const project = await fixture.db.project.create({
      data: { name: "Comment project", teamId, userId: users[0].id },
    });
    projectId = project.id;
    const otherProject = await fixture.db.project.create({
      data: { name: "Other Team project", teamId: otherTeamId, userId: users[1].id },
    });
    otherProjectId = otherProject.id;
    const diagram = await fixture.db.diagram.create({
      data: { name: "Comment ERD", uid: randomUUID(), projectId, userId: users[0].id },
    });
    diagramId = diagram.id;
    diagramUid = diagram.uid;
    anchorId = "entity-users";
    await fixture.db.entity.create({
      data: { id: anchorId, diagramId: diagram.id, name: "users", x: 0, y: 0 },
    });

    const app = express();
    app.use(express.json());
    app.use(
      "/api/projects/:projectId/discussions",
      middleware.authenticate,
      discussions.requireCloudDiscussionTeam,
      discussions.setCollaborationResource("discussion"),
      discussions.default,
    );
    app.use(
      "/api/projects/:projectId/comments",
      middleware.authenticate,
      discussions.requireCloudDiscussionTeam,
      discussions.setCollaborationResource("comment"),
      discussions.default,
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server!.once("listening", resolve);
      server!.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Comment test server did not bind.");
    serverUrl = "http://127.0.0.1:" + address.port;
  }, 30000);

  afterAll(async () => {
    if (server) {
      const activeServer = server;
      server = null;
      await new Promise<void>((resolve, reject) => {
        activeServer.close((error) => error ? reject(error) : resolve());
      });
    }
    await fixture.db?.$disconnect();
    if (schemaCreated && pool) {
      await pool.query("DROP SCHEMA \"" + schema + "\" CASCADE");
      expect((await pool.query("SELECT nspname FROM pg_namespace WHERE nspname = $1", [schema])).rows).toEqual([]);
    }
    await pool?.end();
    if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
    for (const [key, value] of originalEnvironment) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("serializes concurrent comments and replies and rejects stale or unauthorized edits", async () => {
    const basePath = "/api/projects/" + projectId + "/comments";
    const storedProject = await fixture.db.project.findUnique({ where: { id: projectId }, select: { id: true, teamId: true } });
    expect(storedProject).toEqual({ id: projectId, teamId });
    const fileList = await fetch(serverUrl + basePath + "?feature_type=diagram&file_id=" + diagramUid, {
      headers: actorHeaders(0),
    });
    expect(fileList.status).toBe(200);
    const otherTeamList = await fetch(
      serverUrl + "/api/projects/" + otherProjectId + "/discussions?scope=project",
      { headers: actorHeaders(0) },
    );
    expect(otherTeamList.status).toBe(404);
    expect(await otherTeamList.json()).toEqual({ error: "Resource not found" });
    const noMembershipRead = await fetch(
      serverUrl + "/api/projects/" + otherProjectId + "/discussions?scope=project",
      { headers: actorHeaders(0, otherTeamId) },
    );
    expect(noMembershipRead.status).toBe(404);
    expect(await noMembershipRead.json()).toEqual({ error: "Resource not found" });
    const pathname = basePath + "?feature_type=diagram&file_id=" + diagramUid;
    const create = (actorIndex: number, body: string) => fetch(serverUrl + pathname, {
      method: "POST",
      headers: { ...actorHeaders(actorIndex), "content-type": "application/json" },
      body: JSON.stringify({ body, context: { featureType: "diagram", fileId: diagramUid, type: "table", id: anchorId } }),
    });
    const responses = await Promise.all([
      create(0, "First concurrent comment"),
      create(1, "Second concurrent comment"),
    ]);
    const payloads = await Promise.all(responses.map((response) => response.json()));

    expect(responses.map((response, index) => ({ status: response.status, body: payloads[index] }))).toEqual([
      { status: 201, body: expect.objectContaining({ kind: "comment" }) },
      { status: 201, body: expect.objectContaining({ kind: "comment" }) },
    ]);
    expect(payloads[0].id).toBe(payloads[1].id);
    expect(payloads[0].messageId).not.toBe(payloads[1].messageId);
    expect(await fixture.db.commentThread.count({
      where: { projectId, teamId, fileId: String(diagramId), anchorType: "table", anchorId },
    })).toBe(1);
    expect(await fixture.db.commentMessage.count()).toBe(2);
    expect(await fixture.db.commentRead.count()).toBe(2);

    const threadId = payloads[0].id;
    const messagePath = basePath + "/" + threadId + "/messages?feature_type=diagram&file_id=" + diagramUid;
    const reply = (actorIndex: number, body: string) => fetch(serverUrl + messagePath, {
      method: "POST",
      headers: { ...actorHeaders(actorIndex), "content-type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const replies = await Promise.all([
      reply(0, "First concurrent reply"),
      reply(1, "Second concurrent reply"),
    ]);
    const replyPayloads = await Promise.all(replies.map((response) => response.json()));
    expect(replies.map((response) => response.status)).toEqual([201, 201]);
    expect(replyPayloads[0].id).not.toBe(replyPayloads[1].id);
    expect(await fixture.db.commentMessage.count({ where: { threadId } })).toBe(4);

    const firstMessageId = payloads[0].messageId;
    const messageUrl = basePath + "/" + threadId + "/messages/" + firstMessageId
      + "?feature_type=diagram&file_id=" + diagramUid;
    const staleEdit = await fetch(serverUrl + messageUrl, {
      method: "PATCH",
      headers: { ...actorHeaders(0), "content-type": "application/json" },
      body: JSON.stringify({ body: "Stale edit", expectedBody: "Old version" }),
    });
    expect(staleEdit.status).toBe(409);
    const ownerEdit = await fetch(serverUrl + messageUrl, {
      method: "PATCH",
      headers: { ...actorHeaders(0), "content-type": "application/json" },
      body: JSON.stringify({ body: "Updated first comment", expectedBody: "First concurrent comment" }),
    });
    expect(ownerEdit.status).toBe(200);
    const otherActorEdit = await fetch(serverUrl + messageUrl, {
      method: "PATCH",
      headers: { ...actorHeaders(1), "content-type": "application/json" },
      body: JSON.stringify({ body: "Unauthorized edit", expectedBody: "Updated first comment" }),
    });
    expect(otherActorEdit.status).toBe(404);
    expect((await fixture.db.commentMessage.findUnique({
      where: { id: firstMessageId },
      select: { body: true },
    }))?.body).toBe("Updated first comment");

    const threadUrl = basePath + "/" + threadId + "?feature_type=diagram&file_id=" + diagramUid;
    const resolve = await fetch(serverUrl + threadUrl, {
      method: "PATCH",
      headers: { ...actorHeaders(0), "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved", expectedStatus: "open" }),
    });
    expect(resolve.status).toBe(200);
    const staleResolve = await fetch(serverUrl + threadUrl, {
      method: "PATCH",
      headers: { ...actorHeaders(1), "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved", expectedStatus: "open" }),
    });
    expect(staleResolve.status).toBe(409);
    expect((await fixture.db.commentThread.findUnique({
      where: { id: threadId },
      select: { status: true },
    }))?.status).toBe("resolved");
  });
});
