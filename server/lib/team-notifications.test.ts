import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ managers: vi.fn(), user: vi.fn(), create: vi.fn(), publish: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: { teamMember: { findMany: mocks.managers }, user: { findUnique: mocks.user } } }));
vi.mock("./notifications.js", () => ({ createNotifications: mocks.create }));
vi.mock("./cloud-live-sync.js", () => ({ publishUserNotification: mocks.publish }));

import { notifyTeamMember } from "./team-notifications.js";

beforeEach(() => {
  mocks.managers.mockReset().mockResolvedValue([{ userId: "boss" }, { userId: "lead" }]);
  mocks.user.mockReset().mockResolvedValue({ name: "Ed", email: "ed@example.test" });
  mocks.create.mockReset().mockResolvedValue(2);
  mocks.publish.mockReset().mockResolvedValue(undefined);
});

describe("Team member notifications (NOT-001.9)", () => {
  it("tells an added member and the other active Managers, without the actor", async () => {
    await expect(notifyTeamMember({ type: "team.member_added", teamId: "team-1", userId: "ed", actorId: "boss" })).resolves.toEqual(["ed", "lead"]);

    expect(mocks.managers).toHaveBeenCalledWith({ where: { teamId: "team-1", role: "manager", status: "active" }, select: { userId: true } });
    const [member, manager] = mocks.create.mock.calls[0][0];
    expect(member).toEqual({
      recipientUserId: "ed",
      actorUserId: "boss",
      scopeType: "team",
      teamId: "team-1",
      type: "team.member_added",
      entityType: "team_member",
      entityId: "ed",
      groupKey: "team:team-1:members",
      link: "/",
      payload: {},
    });
    expect(manager).toMatchObject({ recipientUserId: "lead", link: "/teams/team-1", payload: { memberName: "Ed" } });
    expect(mocks.publish).toHaveBeenCalledWith(["ed", "lead"]);
  });

  it("gives a removed member no link, since they can no longer open the Team", async () => {
    await notifyTeamMember({ type: "team.member_removed", teamId: "team-1", userId: "ed", actorId: "admin" });

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs.map((input: any) => input.recipientUserId)).toEqual(["ed", "boss", "lead"]);
    expect(inputs[0]).toMatchObject({ type: "team.member_removed", link: null, payload: {} });
    expect(inputs[1]).toMatchObject({ link: "/teams/team-1", payload: { memberName: "Ed" } });
  });

  it("never fails the Team change when storing notifications fails", async () => {
    mocks.create.mockRejectedValue(new Error("database down"));

    await expect(notifyTeamMember({ type: "team.member_removed", teamId: "team-1", userId: "ed", actorId: "admin" })).resolves.toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
