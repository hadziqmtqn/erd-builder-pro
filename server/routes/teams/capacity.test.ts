import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sso: false,
  plan: { maxTeams: 2, maxMembers: 2 },
  db: {
    team: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    teamMember: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    session: { deleteMany: vi.fn() },
    teamAuditEvent: { create: vi.fn() },
    $transaction: vi.fn(), $queryRaw: vi.fn(),
  },
}));
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: () => mocks.sso, getSsoConfig: () => ({ issuerUrl: "https://example.test" }) }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.db }));
vi.mock("../../lib/license-client.js", () => ({
  getStoredInstanceLicense: () => ({ lastCheckedAt: new Date().toISOString() }),
  verifyStoredInstanceLicense: () => ({ entitlement: mocks.plan }),
  checkSelfHostInstanceLicense: async () => ({ entitlement: mocks.plan }),
  LicenseClientError: class extends Error {},
}));
const { teamProvisioningSignature, membershipProvisioningSignature, isProvisionedTeam } = await import("../../lib/team-provisioning.js");
const teams = await import("./service.js");
const { instanceLicenseUsage } = await import("../../lib/instance-license-usage.js");
let directory: string;
let records: any[];
let memberships: any[];
let queue: Promise<unknown>;
const originalIdentity = process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
const originalState = process.env.ERDBPRO_LICENSE_STATE_FILE;

function record(id: string, status = "active") {
  const value = { id, name: id, type: "team", status, createdAt: new Date("2026-01-01"), cloudEntitlement: null, projects: [{ id: "retained-project" }] };
  return { ...value, provisioningSignature: teamProvisioningSignature(value) };
}
function membership(teamId: string, userId: string, role = "staff") {
  const value = { id: `${teamId}-${userId}`, teamId, userId, role, status: "active", joinedAt: new Date("2026-01-01") };
  return { ...value, provisioningSignature: membershipProvisioningSignature(value), user: { id: userId, email: `${userId}@example.test`, name: userId } };
}
function matches(member: any, where: any = {}) {
  if (where.teamId && member.teamId !== where.teamId) return false;
  if (where.userId && member.userId !== where.userId) return false;
  if (where.status && member.status !== where.status) return false;
  if (where.role && member.role !== where.role) return false;
  if (where.team) {
    const parent = records.find(value => value.id === member.teamId);
    if (!parent || parent.status !== where.team.status || parent.type === "personal") return false;
  }
  return true;
}
beforeEach(() => {
  vi.resetAllMocks();
  directory = mkdtempSync(path.join(tmpdir(), "erd-capacity-"));
  process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(directory, "installation-identity.json");
  process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(directory, "license-state.json");
  mocks.sso = false;
  mocks.plan = { maxTeams: 2, maxMembers: 2 };
  records = [record("one")];
  memberships = [membership("one", "manager", "manager"), membership("one", "staff")];
  queue = Promise.resolve();
  mocks.db.$queryRaw.mockResolvedValue([{ locked: 1 }]);
  mocks.db.$transaction.mockImplementation((work) => {
    const result = queue.then(() => work(mocks.db));
    queue = result.catch(() => undefined);
    return result;
  });
  mocks.db.team.findUnique.mockImplementation(async ({ where }) => {
    const value = records.find(team => team.id === where.id);
    return value ? { ...value, members: memberships.filter(member => member.teamId === value.id) } : null;
  });
  mocks.db.team.findMany.mockImplementation(async () => records);
  mocks.db.team.findFirst.mockImplementation(async ({ where }) => records.find(team => team.name === where.name.equals));
  mocks.db.team.count.mockImplementation(async () => records.filter(team => team.type !== "personal" && team.status === "active").length);
  mocks.db.team.create.mockImplementation(async ({ data }) => { records.push(data); return data; });
  mocks.db.team.update.mockImplementation(async ({ where, data }) => {
    const value = records.find(team => team.id === where.id);
    Object.assign(value, data); return value;
  });
  mocks.db.team.updateMany.mockImplementation(async ({ where, data }) => {
    const value = records.find(team => team.id === where.id && team.status === where.status && team.provisioningSignature === where.provisioningSignature);
    if (!value) return { count: 0 };
    Object.assign(value, data); return { count: 1 };
  });
  mocks.db.teamMember.findMany.mockImplementation(async ({ where, distinct }) => {
    const found = memberships.filter(member => matches(member, where));
    return distinct ? [...new Map(found.map(member => [member.userId, member])).values()] : found;
  });
  mocks.db.teamMember.findFirst.mockImplementation(async ({ where }) => memberships.find(member => matches(member, where)) || null);
  mocks.db.teamMember.count.mockImplementation(async ({ where }) => memberships.filter(member => matches(member, where)).length);
  mocks.db.teamMember.update.mockImplementation(async ({ where, data }) => {
    const value = memberships.find(member => member.id === where.id);
    Object.assign(value, data); return value;
  });
  mocks.db.user.findUnique.mockImplementation(async ({ where }) => ({ id: where.email.split("@")[0], email: where.email, isSuperAdmin: false }));
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  if (originalIdentity === undefined) delete process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
  else process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = originalIdentity;
  if (originalState === undefined) delete process.env.ERDBPRO_LICENSE_STATE_FILE;
  else process.env.ERDBPRO_LICENSE_STATE_FILE = originalState;
});

describe("SH-001 / SH-003 capacity reconciliation", () => {
  it("counts distinct active users only in active non-Personal Teams", async () => {
    records.push(record("two"), record("inactive", "inactive"), record("quarantine", "quarantined"), { ...record("personal"), type: "personal" });
    memberships.push(membership("two", "staff"), membership("inactive", "old"), membership("quarantine", "bad"), membership("personal", "owner"));
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 2, memberCount: 2 });
  });
  it("keeps admin recovery metadata available while document access and Manager management are denied over quota", async () => {
    mocks.plan.maxMembers = 1;
    await expect(teams.getTeam("one", "admin", true)).resolves.toMatchObject({ capacity: { exceeded: true } });
    await expect(teams.canAccessTeam("one", "admin", true)).resolves.toBe(false);
    await expect(teams.getTeam("one", "manager", false)).rejects.toMatchObject({ code: "INSTANCE_CAPACITY_EXCEEDED" });
    await expect(teams.canUserLogin("staff")).resolves.toEqual({ allowed: false, code: "INSTANCE_CAPACITY_EXCEEDED" });
  });
  it("recovers from member overage by deactivating a membership with audit and without deleting the account", async () => {
    mocks.plan.maxMembers = 1;
    await expect(teams.removeMember("one", "staff", "admin", true)).resolves.toBe(true);
    expect(memberships.find(member => member.userId === "staff").status).toBe("inactive");
    expect(mocks.db.teamAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "member_deactivated", actorId: "admin" }) });
    expect(mocks.db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "staff" } });
    await expect(teams.canAccessTeam("one", "manager", false)).resolves.toBe(true);
  });
  it("deactivates over-capacity Teams while retaining projects, memberships and a valid signature", async () => {
    records.push(record("two"));
    mocks.plan.maxTeams = 1;
    const before = structuredClone(memberships);
    await expect(teams.changeTeamStatus("one", "inactive", "admin", true)).resolves.toBe(true);
    expect(memberships).toEqual(before);
    expect(records[0].projects).toEqual([{ id: "retained-project" }]);
    expect(isProvisionedTeam(records[0])).toBe(true);
    expect(mocks.db.teamAuditEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "team_deactivated", actorId: "admin" }) });
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 1, memberCount: 0 });
    await expect(teams.canAccessTeam("one", "admin", true)).resolves.toBe(false);
    await expect(teams.canAccessTeam("two", "admin", true)).resolves.toBe(true);
  });
  it("rejects activation when the active Team limit is full", async () => {
    records.push(record("old", "inactive")); mocks.plan.maxTeams = 1;
    await expect(teams.changeTeamStatus("old", "active", "admin", true)).rejects.toMatchObject({ code: "TEAM_LIMIT_REACHED" });
    expect(mocks.db.team.updateMany).not.toHaveBeenCalled();
    expect(mocks.db.teamAuditEvent.create).not.toHaveBeenCalled();
  });
  it("rejects activation whose retained members would exceed the unique-user quota", async () => {
    records.push(record("old", "inactive")); memberships.push(membership("old", "new-user"));
    await expect(teams.changeTeamStatus("old", "active", "admin", true)).rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });
    expect(mocks.db.team.updateMany).not.toHaveBeenCalled();
  });
  it("allows activation with shared members without charging another seat", async () => {
    records.push(record("old", "inactive")); memberships.push(membership("old", "staff"));
    await teams.changeTeamStatus("old", "active", "admin", true);
    await expect(instanceLicenseUsage()).resolves.toEqual({ teamCount: 2, memberCount: 2 });
    expect(isProvisionedTeam(records[1])).toBe(true);
  });
  it("does not restore quarantined Teams or re-sign manually changed records", async () => {
    records.push(record("bad", "quarantined"));
    await expect(teams.changeTeamStatus("bad", "active", "admin", true)).rejects.toMatchObject({ code: "TEAM_STATUS_CHANGE_NOT_ALLOWED" });
    records[0].status = "inactive";
    await expect(teams.changeTeamStatus("one", "active", "admin", true)).rejects.toMatchObject({ code: "TEAM_INTEGRITY_UNAVAILABLE" });
    expect(mocks.db.team.updateMany).not.toHaveBeenCalled();
  });
  it("rejects status changes by Managers and all local status mutations in Cloud", async () => {
    await expect(teams.changeTeamStatus("one", "inactive", "manager", false)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
    mocks.sso = true;
    await expect(teams.changeTeamStatus("one", "inactive", "admin", true)).rejects.toMatchObject({ code: "CLOUD_TEAM_MANAGED_EXTERNALLY" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("takes the shared PostgreSQL lock before counting and prevents two queued creates from using the last slot", async () => {
    const results = await Promise.allSettled([
      teams.createTeam({ name: "two", userId: "admin", isSuperAdmin: true }),
      teams.createTeam({ name: "three", userId: "admin", isSuperAdmin: true }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find(result => result.status === "rejected")).toMatchObject({ reason: { code: "TEAM_LIMIT_REACHED" } });
    expect(records.filter(team => team.status === "active")).toHaveLength(2);
    expect(mocks.db.$queryRaw.mock.calls[0][0].join("")).toContain("pg_advisory_xact_lock");
    expect(mocks.db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
  });
  it("rechecks the Manager permission inside the transaction after a concurrent removal", async () => {
    const original = mocks.db.$transaction.getMockImplementation()!;
    mocks.db.$transaction.mockImplementation(async (work, options) => {
      memberships.find(member => member.userId === "manager").status = "inactive";
      return original(work, options);
    });
    await expect(teams.addMember("one", "new-user@example.test", "manager", false)).rejects.toMatchObject({ code: "TEAM_MANAGER_REQUIRED" });
    expect(mocks.db.teamMember.upsert).not.toHaveBeenCalled();
  });  it("refuses a status transition when the signed record changes before compare-and-set", async () => {
    mocks.db.team.updateMany.mockResolvedValue({ count: 0 });
    await expect(teams.changeTeamStatus("one", "inactive", "admin", true)).rejects.toMatchObject({ code: "TEAM_STATUS_CHANGE_NOT_ALLOWED" });
    expect(mocks.db.teamAuditEvent.create).not.toHaveBeenCalled();
  });
  it("keeps inventory metadata available without exposing signatures or offering quarantine restoration", async () => {
    records.push(record("quarantined", "quarantined"));
    const result = await teams.listTeamInventory(true);
    expect(result.teams.find((value: any) => value.id === "one")).toMatchObject({ canChangeStatus: true });
    expect(result.teams.find((value: any) => value.id === "quarantined")).toMatchObject({ canChangeStatus: false });
    expect(result.teams.every((value: any) => !("provisioningSignature" in value))).toBe(true);
    await expect(teams.listTeamInventory(false)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
  });
  it("rejects unsupported status values at both request validation and the service boundary", async () => {
    const { updateTeamStatusSchema } = await import("../../lib/validation.js");
    expect(updateTeamStatusSchema.safeParse({ status: "quarantined" }).success).toBe(false);
    await expect(teams.changeTeamStatus("one", "quarantined" as "active", "admin", true)).rejects.toMatchObject({ code: "TEAM_STATUS_CHANGE_NOT_ALLOWED" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });
  it("charges a new active seat when the user only has membership in an inactive Team", async () => {
    records.push(record("old", "inactive")); memberships.push(membership("old", "new-user"));
    await expect(teams.addMember("one", "new-user@example.test", "admin", true)).rejects.toMatchObject({ code: "MEMBER_LIMIT_REACHED" });
    expect(mocks.db.teamMember.upsert).not.toHaveBeenCalled();
  });
  it("identifies inactive workspace access without misreporting an expired license", async () => {
    await teams.changeTeamStatus("one", "inactive", "admin", true);
    await expect(teams.canUserLogin("staff")).resolves.toEqual({ allowed: false, code: "TEAM_INACTIVE" });
  });

});
