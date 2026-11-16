import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  members: vi.fn(),
  project: vi.fn(),
  user: vi.fn(),
  create: vi.fn(),
  publish: vi.fn(),
}));
vi.mock("./prisma.js", () => ({
  prisma: { teamMember: { findMany: mocks.members }, project: { findUnique: mocks.project }, user: { findUnique: mocks.user } },
}));
vi.mock("./notifications.js", () => ({ createNotifications: mocks.create }));
vi.mock("./cloud-live-sync.js", () => ({ publishUserNotification: mocks.publish }));

import { notifyProjectAccess, type AccessChange } from "./project-notifications.js";

const change = (overrides: Partial<AccessChange> = {}): AccessChange => ({
  projectId: 7,
  teamId: "team-1",
  actorId: "boss",
  targetId: "ed",
  ownerId: "creator",
  role: "editor",
  previousRole: null,
  auditId: "audit-1",
  ...overrides,
});

beforeEach(() => {
  mocks.members.mockReset().mockImplementation(async ({ where }: any) => where.userId.in.map((userId: string) => ({ userId })));
  mocks.project.mockReset().mockResolvedValue({ name: "Billing" });
  mocks.user.mockReset().mockResolvedValue({ name: "Ed", email: "ed@example.test" });
  mocks.create.mockReset().mockResolvedValue(2);
  mocks.publish.mockReset().mockResolvedValue(undefined);
});

describe("Project access notifications (NOT-001.8)", () => {
  it("tells the member, and the Project creator by the member's name, when a Manager grants a role", async () => {
    await expect(notifyProjectAccess(change())).resolves.toEqual(["ed", "creator"]);

    expect(mocks.members).toHaveBeenCalledWith({ where: { teamId: "team-1", userId: { in: ["ed", "creator"] }, status: "active" }, select: { userId: true } });
    const [member, creator] = mocks.create.mock.calls[0][0];
    expect(member).toEqual({
      recipientUserId: "ed",
      actorUserId: "boss",
      scopeType: "project",
      teamId: "team-1",
      projectId: 7,
      type: "project.access_granted",
      entityType: "project",
      entityId: "7",
      groupKey: "project:7:access",
      link: "/projects/7",
      sourceEventId: "project_access_changed:audit-1",
      payload: { projectName: "Billing", role: "editor", previousRole: null },
    });
    expect(creator).toMatchObject({ recipientUserId: "creator", payload: { projectName: "Billing", role: "editor", previousRole: null, memberName: "Ed" } });
    expect(mocks.publish).toHaveBeenCalledWith(["ed", "creator"]);
  });

  it("calls a changed or cleared role role_changed, and spares the creator their own action", async () => {
    await notifyProjectAccess(change({ actorId: "creator", role: null, previousRole: "editor" }));

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ recipientUserId: "ed", type: "project.role_changed", payload: { role: null, previousRole: "editor" } });
  });

  it("tells the creator once when a Manager changes the creator's own role", async () => {
    await notifyProjectAccess(change({ targetId: "creator", role: "viewer", previousRole: null }));

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs).toHaveLength(1);
    expect(inputs[0].payload).toEqual({ projectName: "Billing", role: "viewer", previousRole: null });
  });

  it("leaves out anyone who is no longer an active member, and never fails the access change", async () => {
    mocks.members.mockResolvedValue([]);
    await expect(notifyProjectAccess(change())).resolves.toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.members.mockResolvedValue([{ userId: "ed" }]);
    mocks.create.mockRejectedValue(new Error("database down"));
    await expect(notifyProjectAccess(change())).resolves.toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
