import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  sso: false,
  db: {
    user: { findUnique: vi.fn() }, team: { findUnique: vi.fn(), findMany: vi.fn() },
    teamAuditEvent: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    project: { create: vi.fn() }, note: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    diagram: { findMany: vi.fn() }, drawing: { findMany: vi.fn() }, flowchart: { findMany: vi.fn() },
  },
}));
vi.mock("../../lib/prisma.js", () => ({ prisma: fixture.db }));
vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true, isSsoAuthMode: () => fixture.sso }));
vi.mock("../../lib/team-provisioning.js", () => ({ isProvisionedTeam: (team: any) => team.provisioningSignature === "verified", isProvisionedMembership: (member: any) => member.provisioningSignature === "verified" }));
vi.mock("../../lib/team-capacity-transaction.js", () => ({ withTeamCapacityTransaction: (work: any) => work(fixture.db) }));
vi.mock("../../lib/instance-license-usage.js", () => ({ instanceLicenseUsage: async () => ({ teamCount: 1, memberCount: 1 }) }));
vi.mock("./service.js", () => ({
  TeamServiceError: class extends Error { constructor(public code: string, public status: number, message = code) { super(message); } },
  requireActiveInstanceLicense: async () => ({ maxTeams: 10, maxMembers: 10 }),
}));
const { recoveryInventory, recoverFiles } = await import("./recovery.js");
const source = { id: "source", name: "Source", type: "team", status: "quarantined" };
const target = { id: "target", name: "Target", type: "team", status: "active", provisioningSignature: "verified", members: [] };
const request = { operationId: "request", targetTeamId: "target", files: [{ type: "notes" as const, id: 4 }] };

beforeEach(() => {
  vi.resetAllMocks(); fixture.sso = false;
  fixture.db.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
  fixture.db.team.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "source" ? source : target));
  fixture.db.team.findMany.mockResolvedValue([target, { ...target, id: "bad", provisioningSignature: "invalid" }]);
  fixture.db.teamAuditEvent.findMany.mockResolvedValue([]);
  fixture.db.teamAuditEvent.findUnique.mockResolvedValue(null);
  fixture.db.project.create.mockResolvedValue({ id: 30 });
  fixture.db.note.findFirst.mockResolvedValue({ id: 4, title: "Note", content: "<p>Original</p>", projectId: 2, userId: "author", project: { id: 2, name: "Project", color: "blue" } });
  fixture.db.note.create.mockResolvedValue({ id: 40, uid: "copied" });
  for (const model of [fixture.db.note, fixture.db.diagram, fixture.db.drawing, fixture.db.flowchart]) model.findMany.mockResolvedValue([]);
});

describe("quarantined Team file recovery", () => {
  it("rejects non-admin and Cloud requests before reading quarantined content", async () => {
    await expect(recoveryInventory("source", false)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
    fixture.sso = true;
    await expect(recoveryInventory("source", true)).rejects.toMatchObject({ code: "SELF_HOST_ONLY" });
    expect(fixture.db.team.findUnique).not.toHaveBeenCalled();
    fixture.sso = false;
    fixture.db.team.findUnique.mockResolvedValue({ ...source, status: "active" });
    await expect(recoveryInventory("source", true)).rejects.toMatchObject({ code: "RECOVERY_SOURCE_NOT_QUARANTINED" });
    expect(fixture.db.note.findMany).not.toHaveBeenCalled();
  });
  it("returns only metadata and verified destination Teams", async () => {
    fixture.db.note.findMany.mockResolvedValue([{ id: 4, title: "Note", content: "secret content", project: { id: 2, name: "Project" }, updatedAt: null }]);
    const inventory = await recoveryInventory("source", true);
    expect(inventory.destinations).toEqual([{ id: "target", name: "Target" }]);
    expect(JSON.stringify(inventory)).not.toContain("secret content");
    expect(fixture.db.note.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false, project: { teamId: "source", isDeleted: false } } }));
  });
  it("creates private copies and records provenance without modifying the source", async () => {
    const first = await recoverFiles("source", "admin", true, request);
    expect(fixture.db.note.create).toHaveBeenCalledWith({ data: expect.objectContaining({ content: "<p>Original</p>", projectId: 30, isPublic: false, publicAccess: "off", shareToken: null, shareTokenHash: null, userId: "admin" }) });
    expect(fixture.db.project.create).toHaveBeenCalledWith({ data: expect.objectContaining({ teamId: "target", name: "Project" }) });
    const event = fixture.db.teamAuditEvent.create.mock.calls[0][0].data;
    expect(event).toMatchObject({ id: "request", teamId: "source", actorId: "admin", action: "files_recovered" });
    const metadata = JSON.parse(event.metadata);
    fixture.db.teamAuditEvent.findUnique.mockResolvedValue(event);
    expect(await recoverFiles("source", "admin", true, request)).toEqual(first);
    expect(fixture.db.note.create).toHaveBeenCalledTimes(1);
    expect(metadata.result.items[0]).toMatchObject({ id: 4, copiedId: 40, sourceOwnerId: "author" });
    await expect(recoverFiles("source", "admin", true, { ...request, files: [{ type: "notes", id: 9 }] })).rejects.toMatchObject({ code: "RECOVERY_REQUEST_CONFLICT" });
  });
  it("rechecks the actor and destination before copying", async () => {
    fixture.db.user.findUnique.mockResolvedValue({ isSuperAdmin: false });
    await expect(recoverFiles("source", "admin", true, request)).rejects.toMatchObject({ code: "SUPER_ADMIN_REQUIRED" });
    fixture.db.user.findUnique.mockResolvedValue({ isSuperAdmin: true });
    fixture.db.team.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "source" ? source : { ...target, status: "inactive" }));
    await expect(recoverFiles("source", "admin", true, request)).rejects.toMatchObject({ code: "RECOVERY_DESTINATION_UNAVAILABLE" });
    fixture.db.team.findUnique.mockImplementation(({ where }) => Promise.resolve(where.id === "source" ? source : { ...target, members: [{ status: "active", provisioningSignature: "invalid" }] }));
    await expect(recoverFiles("source", "admin", true, request)).rejects.toMatchObject({ code: "RECOVERY_DESTINATION_UNAVAILABLE" });
    expect(fixture.db.project.create).not.toHaveBeenCalled();
  });
  it("rejects files outside the quarantined source", async () => {
    fixture.db.note.findFirst.mockResolvedValue(null);
    await expect(recoverFiles("source", "admin", true, request)).rejects.toMatchObject({ code: "RECOVERY_FILE_UNAVAILABLE" });
    expect(fixture.db.note.findFirst).toHaveBeenCalledWith({ where: { id: 4, isDeleted: false, project: { teamId: "source", isDeleted: false } }, include: { project: true } });
    expect(fixture.db.note.create).not.toHaveBeenCalled();
  });
});
