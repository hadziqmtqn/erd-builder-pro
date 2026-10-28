import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scope: { mode: "team", teamId: "team-1" } as { mode: string; teamId: string | null } | null,
  project: { findFirst: vi.fn() },
  teamMember: { findFirst: vi.fn() },
  projectAccessGrant: { findMany: vi.fn() },
}));

vi.mock("./prisma.js", () => ({ prisma: mocks }));
vi.mock("./team-scope.js", () => ({ currentTeamScope: () => mocks.scope }));

import { canCommentRole, canEditRole, canManageAccessRole, effectiveRole, fileAccessRole, isForeignProjectMove, projectRoleFor, projectRolesFor } from "./project-access.js";

function project(overrides: { userId?: string; manager?: boolean; grant?: string }) {
  return {
    userId: overrides.userId ?? "creator",
    team: { members: [{ role: overrides.manager ? "manager" : "staff" }] },
    accessGrants: overrides.grant ? [{ role: overrides.grant }] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope = { mode: "team", teamId: "team-1" };
});

describe("Project role", () => {
  it.each([
    ["owner", { userId: "member" }],
    ["manager", { manager: true }],
    ["editor", { grant: "editor" }],
    ["viewer", { grant: "viewer" }],
    ["commenter", { grant: "commenter" }],
    ["commenter", {}],
  ])("resolves %s", async (role, overrides) => {
    mocks.project.findFirst.mockResolvedValue(project(overrides));
    expect(await projectRoleFor(7, "member")).toBe(role);
  });

  it("looks the Project up inside the active Team only, whatever the client sends", async () => {
    mocks.project.findFirst.mockResolvedValue(null);
    expect(await projectRoleFor(7n, "member")).toBeNull();
    expect(mocks.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7, teamId: "team-1" } }));
  });

  it("returns null outside a Team scope so Personal data never gets a Team role", async () => {
    mocks.scope = { mode: "personal", teamId: null };
    expect(await projectRoleFor(7, "member")).toBeNull();
    expect(mocks.project.findFirst).not.toHaveBeenCalled();
  });

  it("treats an unknown stored role as the least-privileged default that can still comment", async () => {
    mocks.project.findFirst.mockResolvedValue(project({ grant: "owner" }));
    expect(await projectRoleFor(7, "member")).toBe("commenter");
  });

  it("maps roles to abilities", () => {
    expect(["owner", "manager", "editor"].map((role) => canEditRole(role as any))).toEqual([true, true, true]);
    expect(["commenter", "viewer", null].map((role) => canEditRole(role as any))).toEqual([false, false, false]);
    expect(["owner", "manager", "editor", "commenter"].map((role) => canCommentRole(role as any))).toEqual([true, true, true, true]);
    expect([canCommentRole("viewer"), canCommentRole(null)]).toEqual([false, false]);
    expect(["owner", "manager"].map((role) => canManageAccessRole(role as any))).toEqual([true, true]);
    expect(["editor", "commenter", "viewer", null].map((role) => canManageAccessRole(role as any))).toEqual([false, false, false, false]);
  });
});

describe("Effective Project role (COL-007)", () => {
  it("keeps the creator full until a Manager stores a role, and never limits a Manager", () => {
    expect(effectiveRole(true, false, undefined)).toBe("owner");
    expect(effectiveRole(true, false, "viewer")).toBe("viewer");
    expect(effectiveRole(true, true, "viewer")).toBe("owner");
    expect(effectiveRole(false, true, "viewer")).toBe("manager");
    expect(effectiveRole(false, false, undefined)).toBe("commenter");
  });
});

describe("Project roles for a list", () => {
  it("resolves a page with one member lookup and one grant lookup", async () => {
    mocks.teamMember.findFirst.mockResolvedValue({ role: "staff" });
    mocks.projectAccessGrant.findMany.mockResolvedValue([{ projectId: 2, role: "editor" }, { projectId: 3, role: "viewer" }]);
    const roles = await projectRolesFor([{ id: 1, userId: "member" }, { id: 2, userId: "other" }, { id: 3n, userId: "other" }, { id: 4, userId: "other" }], "member");
    expect([...roles]).toEqual([[1, "owner"], [2, "editor"], [3, "viewer"], [4, "commenter"]]);
    expect(mocks.teamMember.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.projectAccessGrant.findMany).toHaveBeenCalledTimes(1);
  });

  it("gives a Manager the manager role on every Project they did not create", async () => {
    mocks.teamMember.findFirst.mockResolvedValue({ role: "manager" });
    mocks.projectAccessGrant.findMany.mockResolvedValue([{ projectId: 2, role: "viewer" }]);
    const roles = await projectRolesFor([{ id: 1, userId: "member" }, { id: 2, userId: "other" }], "member");
    expect([...roles]).toEqual([[1, "owner"], [2, "manager"]]);
  });

  it("marks Personal Projects as owned without querying", async () => {
    mocks.scope = { mode: "personal", teamId: null };
    const roles = await projectRolesFor([{ id: 1, userId: "member" }], "member");
    expect([...roles]).toEqual([[1, "owner"]]);
    expect(mocks.teamMember.findFirst).not.toHaveBeenCalled();
  });
});

describe("File role", () => {
  it("makes the file creator its owner without a lookup", async () => {
    expect(await fileAccessRole({ userId: "member", projectId: 7 }, "member")).toBe("owner");
    expect(mocks.project.findFirst).not.toHaveBeenCalled();
  });

  it("inherits the Project role for another member's file", async () => {
    mocks.project.findFirst.mockResolvedValue(project({ grant: "editor" }));
    expect(await fileAccessRole({ userId: "creator", projectId: 7 }, "member")).toBe("editor");
  });

  it("reads a file without a reachable Project as viewer", async () => {
    mocks.project.findFirst.mockResolvedValue(null);
    expect(await fileAccessRole({ userId: "creator", projectId: 7 }, "member")).toBe("viewer");
    expect(await fileAccessRole({ userId: "creator", projectId: null }, "member")).toBe("viewer");
  });

  it("treats Personal files as owned", async () => {
    mocks.scope = { mode: "personal", teamId: null };
    expect(await fileAccessRole({ userId: "someone", projectId: 7 }, "member")).toBe("owner");
  });
});

describe("Moving a file between Projects", () => {
  it("is allowed for the file creator and for requests that keep the Project", () => {
    expect(isForeignProjectMove({ userId: "member", projectId: 1 }, "member", 2)).toBe(false);
    expect(isForeignProjectMove({ userId: "creator", projectId: 1 }, "member", undefined)).toBe(false);
    expect(isForeignProjectMove({ userId: "creator", projectId: 1n }, "member", 1)).toBe(false);
    expect(isForeignProjectMove({ userId: "creator", projectId: null }, "member", null)).toBe(false);
  });

  it("is refused for anyone else who changes the Project", () => {
    expect(isForeignProjectMove({ userId: "creator", projectId: 1 }, "member", 2)).toBe(true);
    expect(isForeignProjectMove({ userId: "creator", projectId: 1 }, "member", null)).toBe(true);
    expect(isForeignProjectMove({ userId: null, projectId: null }, "member", 3)).toBe(true);
  });
});
