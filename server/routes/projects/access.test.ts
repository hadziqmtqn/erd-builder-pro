import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    projectAccessGrant: { findUnique: vi.fn(), upsert: vi.fn(), delete: vi.fn() },
    teamAuditEvent: { create: vi.fn() },
  };
  return {
    scope: { mode: "team", teamId: "team-1" } as { mode: string; teamId: string | null },
    role: "owner" as string | null,
    tx,
    prisma: {
      project: { findFirst: vi.fn() },
      teamMember: { findMany: vi.fn(), findFirst: vi.fn() },
      projectAccessGrant: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.prisma }));
vi.mock("../../lib/team-scope.js", () => ({ currentTeamScope: () => mocks.scope }));
vi.mock("../../lib/project-access.js", async (importActual) => ({
  ...(await importActual<typeof import("../../lib/project-access.js")>()),
  projectRoleFor: async () => mocks.role,
}));

import { clearProjectAccess, isGrantableRole, listProjectAccess, setProjectAccess } from "./access.js";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { mode: "team", teamId: "team-1" };
  mocks.role = "owner";
  mocks.prisma.project.findFirst.mockResolvedValue({ id: 7, userId: "creator" });
  mocks.prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(mocks.tx));
  mocks.tx.projectAccessGrant.findUnique.mockResolvedValue(null);
});

describe("Project access management (COL-004)", () => {
  it("lists active members with their effective role and which ones can change", async () => {
    mocks.prisma.teamMember.findMany.mockResolvedValue([
      { userId: "creator", role: "staff", user: { name: "Creator", email: "c@example.test" } },
      { userId: "boss", role: "manager", user: { name: "Boss", email: "b@example.test" } },
      { userId: "ed", role: "staff", user: { name: "Ed", email: "e@example.test" } },
      { userId: "vi", role: "staff", user: { name: "Vi", email: "v@example.test" } },
      { userId: "new", role: "staff", user: { name: "New", email: "n@example.test" } },
    ]);
    mocks.prisma.projectAccessGrant.findMany.mockResolvedValue([{ userId: "ed", role: "editor" }, { userId: "vi", role: "viewer" }, { userId: "boss", role: "viewer" }]);

    const result = await listProjectAccess(7, "creator");
    expect(result).toEqual({
      ok: true,
      data: {
        members: [
          { userId: "creator", name: "Creator", email: "c@example.test", teamRole: "staff", role: "owner", isCreator: true, canChange: false },
          { userId: "boss", name: "Boss", email: "b@example.test", teamRole: "manager", role: "manager", isCreator: false, canChange: false },
          { userId: "ed", name: "Ed", email: "e@example.test", teamRole: "staff", role: "editor", isCreator: false, canChange: true },
          { userId: "vi", name: "Vi", email: "v@example.test", teamRole: "staff", role: "viewer", isCreator: false, canChange: true },
          { userId: "new", name: "New", email: "n@example.test", teamRole: "staff", role: "commenter", isCreator: false, canChange: true },
        ],
      },
    });
    expect(mocks.prisma.teamMember.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: "team-1", status: "active" } }));
  });

  it.each(["editor", "commenter", "viewer", null])("hides access management from a %s with the generic not-found", async (role) => {
    mocks.role = role;
    const notFound = { ok: false, status: 404, error: "Resource not found" };
    expect(await listProjectAccess(7, "member")).toEqual(notFound);
    expect(await setProjectAccess(7, "member", "other", "editor")).toEqual(notFound);
    expect(await clearProjectAccess(7, "member", "other")).toEqual(notFound);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("lets a Manager manage access, and refuses outside a Team scope", async () => {
    mocks.role = "manager";
    mocks.prisma.teamMember.findMany.mockResolvedValue([]);
    mocks.prisma.projectAccessGrant.findMany.mockResolvedValue([]);
    expect((await listProjectAccess(7, "boss")).ok).toBe(true);

    mocks.scope = { mode: "personal", teamId: null };
    expect(await listProjectAccess(7, "boss")).toMatchObject({ ok: false, status: 404 });
  });

  it("stores the role, records who granted it, and audits the change with the previous role", async () => {
    mocks.prisma.teamMember.findFirst.mockResolvedValue({ role: "staff" });
    mocks.tx.projectAccessGrant.findUnique.mockResolvedValue({ role: "viewer" });

    expect(await setProjectAccess(7, "creator", "ed", "editor")).toEqual({ ok: true, data: { userId: "ed", role: "editor" } });
    expect(mocks.prisma.teamMember.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: "team-1", userId: "ed", status: "active" } }));
    expect(mocks.tx.projectAccessGrant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId_userId: { projectId: 7, userId: "ed" } },
      create: expect.objectContaining({ projectId: 7, userId: "ed", role: "editor", grantedBy: "creator" }),
      update: { role: "editor", grantedBy: "creator" },
    }));
    const audit = mocks.tx.teamAuditEvent.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ teamId: "team-1", actorId: "creator", action: "project_access_changed", targetType: "project", targetId: "7" });
    expect(JSON.parse(audit.metadata)).toEqual({ userId: "ed", role: "editor", previousRole: "viewer" });
  });

  it("does not grant to someone outside the Team or inactive, and never exposes which", async () => {
    mocks.prisma.teamMember.findFirst.mockResolvedValue(null);
    expect(await setProjectAccess(7, "creator", "stranger", "editor")).toEqual({ ok: false, status: 404, error: "Resource not found" });
    expect(mocks.tx.projectAccessGrant.upsert).not.toHaveBeenCalled();
  });

  it("refuses to restrict the Project creator or a Team Manager", async () => {
    mocks.prisma.teamMember.findFirst.mockResolvedValue({ role: "staff" });
    expect(await setProjectAccess(7, "boss", "creator", "viewer")).toMatchObject({ ok: false, status: 400 });
    mocks.prisma.teamMember.findFirst.mockResolvedValue({ role: "manager" });
    expect(await setProjectAccess(7, "creator", "boss", "viewer")).toMatchObject({ ok: false, status: 400 });
    expect(mocks.tx.projectAccessGrant.upsert).not.toHaveBeenCalled();
  });

  it("removes an explicit role and audits it, but stays silent when there was none", async () => {
    mocks.tx.projectAccessGrant.findUnique.mockResolvedValueOnce({ role: "editor" });
    expect(await clearProjectAccess(7, "creator", "ed")).toEqual({ ok: true, data: { userId: "ed" } });
    expect(mocks.tx.projectAccessGrant.delete).toHaveBeenCalledWith({ where: { projectId_userId: { projectId: 7, userId: "ed" } } });
    expect(JSON.parse(mocks.tx.teamAuditEvent.create.mock.calls[0][0].data.metadata)).toEqual({ userId: "ed", role: null, previousRole: "editor" });

    mocks.tx.projectAccessGrant.delete.mockClear();
    mocks.tx.teamAuditEvent.create.mockClear();
    expect(await clearProjectAccess(7, "creator", "ed")).toEqual({ ok: true, data: { userId: "ed" } });
    expect(mocks.tx.projectAccessGrant.delete).not.toHaveBeenCalled();
    expect(mocks.tx.teamAuditEvent.create).not.toHaveBeenCalled();
  });

  it("accepts only the three grantable roles", () => {
    expect(["editor", "commenter", "viewer"].every(isGrantableRole)).toBe(true);
    expect(["owner", "manager", "", undefined, null, 1].some(isGrantableRole)).toBe(false);
  });
});
