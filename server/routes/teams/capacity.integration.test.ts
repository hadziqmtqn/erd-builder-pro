import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import dotenv from "dotenv";
import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ client: null as any, plan: { maxTeams: 1, maxMembers: 5 } }));
vi.mock("../../lib/prisma.js", () => ({ get prisma() { return fixture.client; } }));
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: () => false }));
vi.mock("../../lib/license-client.js", () => ({
  getStoredInstanceLicense: () => ({ lastCheckedAt: new Date().toISOString() }),
  verifyStoredInstanceLicense: () => ({ entitlement: fixture.plan }),
  checkSelfHostInstanceLicense: async () => ({ entitlement: fixture.plan }),
  LicenseClientError: class extends Error {},
}));
const enabled = process.env.TEAM_CAPACITY_INTEGRATION === "1";
const schema = `test_sh_capacity_${randomUUID().replaceAll("-", "")}`;
let pool: pg.Pool;
let directory: string;
let schemaCreated = false;
let teams: typeof import("./service.js");
let signTeam: typeof import("../../lib/team-provisioning.js").teamProvisioningSignature;
let signMember: typeof import("../../lib/team-provisioning.js").membershipProvisioningSignature;
const originalIdentity = process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
const originalState = process.env.ERDBPRO_LICENSE_STATE_FILE;

async function user(id: string, superAdmin = false) {
  return fixture.client.user.create({ data: { id, email: `${id}@example.test`, name: id, password: "unused-test-password-hash", isSuperAdmin: superAdmin } });
}
async function team(id: string, status = "active") {
  const data = { id, name: id, type: "team", status, createdAt: new Date() };
  return fixture.client.team.create({ data: { ...data, provisioningSignature: signTeam(data) } });
}
async function member(teamId: string, userId: string, role = "staff") {
  const data = { id: randomUUID(), teamId, userId, role, status: "active", joinedAt: new Date() };
  return fixture.client.teamMember.create({ data: { ...data, provisioningSignature: signMember(data) } });
}

describe.skipIf(!enabled)("SH-003 PostgreSQL capacity concurrency (isolated schema)", () => {
  beforeAll(async () => {
    dotenv.config({ quiet: true });
    const url = new URL(process.env.DATABASE_URL || "");
    if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)) throw new Error("Integration tests require a local disposable PostgreSQL schema.");
    directory = mkdtempSync(path.join(tmpdir(), "erd-capacity-integration-"));
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(directory, "installation-identity.json");
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(directory, "license-state.json");
    pool = new pg.Pool({ connectionString: url.toString(), max: 2 });
    await pool.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    await pool.query(`
      CREATE TABLE "${schema}".users (id text PRIMARY KEY, email text UNIQUE NOT NULL, name text, password text NOT NULL,
        is_super_admin boolean, must_change_password boolean NOT NULL DEFAULT false, login_failed_attempts integer NOT NULL DEFAULT 0,
        login_locked_until timestamptz, sso_subject text UNIQUE, sso_email text, cloud_personal_entitlement text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".teams (id text PRIMARY KEY, name text NOT NULL, type text NOT NULL DEFAULT 'team', created_by text,
        sso_organization_id text UNIQUE, status text NOT NULL DEFAULT 'active', cloud_entitlement text, provisioning_signature text,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".team_members (id text PRIMARY KEY, team_id text NOT NULL REFERENCES "${schema}".teams(id),
        user_id text NOT NULL REFERENCES "${schema}".users(id), role text NOT NULL DEFAULT 'staff', status text NOT NULL DEFAULT 'active',
        joined_at timestamptz NOT NULL DEFAULT now(), provisioning_signature text, UNIQUE(team_id, user_id));
      CREATE TABLE "${schema}".sessions (id text PRIMARY KEY, token text UNIQUE NOT NULL, user_id text NOT NULL, email text NOT NULL,
        name text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".team_audit_events (id text PRIMARY KEY, team_id text, actor_id text, action text NOT NULL,
        target_type text, target_id text, metadata text NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE "${schema}".retained_projects (id text PRIMARY KEY, team_id text NOT NULL, content text NOT NULL);
    `);
    const require = createRequire(import.meta.url);
    const { PrismaClient } = require("@erdbpro/prisma-pg-local");
    fixture.client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.toString(), max: 6 }, { schema }) });
    ({ teamProvisioningSignature: signTeam, membershipProvisioningSignature: signMember } = await import("../../lib/team-provisioning.js"));
    teams = await import("./service.js");
  }, 20000);
  beforeEach(async () => {
    fixture.plan = { maxTeams: 1, maxMembers: 5 };
    await fixture.client.teamAuditEvent.deleteMany();
    await fixture.client.teamMember.deleteMany();
    await fixture.client.team.deleteMany();
    await fixture.client.user.deleteMany();
    await pool.query(`DELETE FROM "${schema}".retained_projects`);
    await user("admin", true);
  });
  afterAll(async () => {
    await fixture.client?.$disconnect();
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool?.end();
    if (directory) rmSync(directory, { recursive: true, force: true });
    if (originalIdentity === undefined) delete process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
    else process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = originalIdentity;
    if (originalState === undefined) delete process.env.ERDBPRO_LICENSE_STATE_FILE;
    else process.env.ERDBPRO_LICENSE_STATE_FILE = originalState;
  });
  it("allows only one of two concurrent Team creates to use the last slot", async () => {
    const results = await Promise.allSettled([teams.createTeam({ name: "one", userId: "admin", isSuperAdmin: true }), teams.createTeam({ name: "two", userId: "admin", isSuperAdmin: true })]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "TEAM_LIMIT_REACHED" } });
    expect(await fixture.client.team.count()).toBe(1);
  });
  it("allows only one concurrent member addition to use the last distinct-user seat", async () => {
    await team("one"); await user("manager"); await user("alice"); await user("bob"); await member("one", "manager", "manager");
    fixture.plan.maxMembers = 2;
    const results = await Promise.allSettled([teams.addMember("one", "alice@example.test", "admin", true), teams.addMember("one", "bob@example.test", "admin", true)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "MEMBER_LIMIT_REACHED" } });
    expect(await fixture.client.teamMember.count({ where: { status: "active" } })).toBe(2);
  });
  it("serializes concurrent Team reactivation at the last slot", async () => {
    await team("one", "inactive"); await team("two", "inactive");
    const results = await Promise.allSettled([teams.changeTeamStatus("one", "active", "admin", true), teams.changeTeamStatus("two", "active", "admin", true)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await fixture.client.team.count({ where: { status: "active" } })).toBe(1);
    expect(await fixture.client.teamAuditEvent.count({ where: { action: "team_activated" } })).toBe(1);
  });
  it("retains Team documents and memberships while recovering from a downgrade", async () => {
    await team("one"); await team("two"); await user("member"); await member("two", "member");
    await pool.query(`INSERT INTO "${schema}".retained_projects VALUES ('project', 'two', 'original data')`);
    await expect(teams.canAccessTeam("one", "admin", true)).resolves.toBe(false);
    await expect(teams.getTeam("two", "admin", true)).resolves.toMatchObject({ capacity: { exceeded: true } });
    await teams.changeTeamStatus("two", "inactive", "admin", true);
    await expect(teams.canAccessTeam("one", "admin", true)).resolves.toBe(true);
    expect(await fixture.client.teamMember.count()).toBe(1);
    expect((await pool.query(`SELECT content FROM "${schema}".retained_projects`)).rows).toEqual([{ content: "original data" }]);
    expect(await fixture.client.teamAuditEvent.count({ where: { action: "team_deactivated" } })).toBe(1);
  });
  it("retains the last Manager under concurrent membership deactivation", async () => {
    await team("one"); await user("a"); await user("b"); await member("one", "a", "manager"); await member("one", "b", "manager");
    const results = await Promise.allSettled([teams.removeMember("one", "a", "admin", true), teams.removeMember("one", "b", "admin", true)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "LAST_MANAGER_REQUIRED" } });
    expect(await fixture.client.teamMember.count({ where: { status: "active", role: "manager" } })).toBe(1);
  });  it("rolls back a Team status change when its audit event cannot be persisted", async () => {
    await team("one");
    const original = await fixture.client.team.findUnique({ where: { id: "one" } });
    await pool.query(`ALTER TABLE "${schema}".team_audit_events ADD CONSTRAINT reject_test_deactivation CHECK (action <> 'team_deactivated')`);
    try {
      await expect(teams.changeTeamStatus("one", "inactive", "admin", true)).rejects.toThrow();
      const retained = await fixture.client.team.findUnique({ where: { id: "one" } });
      expect(retained.status).toBe("active");
      expect(retained.provisioningSignature).toBe(original.provisioningSignature);
      expect(await fixture.client.teamAuditEvent.count()).toBe(0);
    } finally {
      await pool.query(`ALTER TABLE "${schema}".team_audit_events DROP CONSTRAINT reject_test_deactivation`);
    }
  });

});
