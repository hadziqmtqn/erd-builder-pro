import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  database: {
    user: { count: vi.fn(), findMany: vi.fn() },
    teamMember: { findMany: vi.fn() },
  },
}));

vi.mock("../../lib/config.js", () => ({ isLocalPostgres: () => true }));
vi.mock("../../lib/prisma.js", () => ({ prisma: mocks.database }));
vi.mock("../teams/service.js", async () => {
  const actual = await vi.importActual<typeof import("../teams/service.js")>("../teams/service.js");
  return { ...actual, requireActiveInstanceLicense: vi.fn().mockResolvedValue({}) };
});

const users = await import("./service.js");

describe("User management listing", () => {
  it("returns Team history for accounts that have not logged in yet", async () => {
    mocks.database.user.count.mockResolvedValue(1);
    mocks.database.user.findMany.mockResolvedValue([
      { id: "member-1", name: "Member One", email: "member@example.com", createdAt: "2026-09-07T00:00:00.000Z" },
    ]);
    mocks.database.teamMember.findMany.mockResolvedValue([
      { userId: "member-1", role: "staff", status: "active", joinedAt: "2026-09-07T00:00:00.000Z", team: { id: "team-1", name: "Team TM" } },
    ]);

    const result = await users.listUsers("all", 1, 20, "member");

    expect(result.data[0]).toMatchObject({ createdAt: "2026-09-07T00:00:00.000Z" });
    expect(result.data[0].teamMemberships[0].team.name).toBe("Team TM");
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(mocks.database.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 20 }));
  });
});
