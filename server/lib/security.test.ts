import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopMode: vi.fn(() => true),
  isLocalPostgres: vi.fn(() => false),
  isSsoAuthMode: vi.fn(() => false),
  projectRole: vi.fn(),
}));

vi.mock("./config.js", () => ({
  isDesktopMode: mocks.isDesktopMode,
  isLocalPostgres: mocks.isLocalPostgres,
  isSsoAuthMode: mocks.isSsoAuthMode,
}));
vi.mock("./team-scope.js", () => ({
  currentTeamScope: vi.fn(),
  projectScopeWhere: vi.fn(() => ({})),
}));
vi.mock("./project-access.js", () => ({
  canCommentRole: (role: string | null) => role !== null && role !== "viewer",
  projectRoleFor: mocks.projectRole,
}));

import { currentTeamScope } from "./team-scope.js";
import { requireAdmin, resolveNewFileProjectId } from "./security.js";

describe("requireAdmin Express middleware", () => {
  beforeEach(() => mocks.isSsoAuthMode.mockReturnValue(false));

  it("continues to the handler for an admin", () => {
    const next = vi.fn();

    expect(requireAdmin({} as any, {} as any, next)).toBe(true);
    expect(next).toHaveBeenCalledOnce();
  });

  it("stops after sending the rejection", () => {
    mocks.isSsoAuthMode.mockReturnValue(true);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    expect(requireAdmin({} as any, res, next)).toBe(false);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe("resolveNewFileProjectId with Project roles (COL-004)", () => {
  const prisma = { project: { findFirst: vi.fn() } } as any;

  beforeEach(() => {
    prisma.project.findFirst.mockResolvedValue({ id: 7 });
    mocks.projectRole.mockReset();
  });

  it.each(["owner", "manager", "editor", "commenter"])("lets a %s add a file to a Team Project", async (role) => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "team", teamId: "team-1" });
    mocks.projectRole.mockResolvedValue(role);
    expect(await resolveNewFileProjectId(prisma, "member", 7)).toBe(7);
  });

  it("treats a Team Project as missing for a Viewer or for a member the Project does not reach", async () => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "team", teamId: "team-1" });
    for (const role of ["viewer", null]) {
      mocks.projectRole.mockResolvedValue(role);
      await expect(resolveNewFileProjectId(prisma, "member", 7)).rejects.toMatchObject({ status: 404, message: "Project not found" });
    }
  });

  it("answers a missing Project with 404 and a Team file without a Project with 400", async () => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "team", teamId: "team-1" });
    prisma.project.findFirst.mockResolvedValueOnce(null);
    await expect(resolveNewFileProjectId(prisma, "member", 99)).rejects.toMatchObject({ status: 404 });
    await expect(resolveNewFileProjectId(prisma, "member", null)).rejects.toMatchObject({ status: 400, message: "A project is required" });
    await expect(resolveNewFileProjectId(prisma, "member", "abc")).rejects.toMatchObject({ status: 400, message: "Invalid project_id" });
  });

  it("never consults Project roles for Personal files", async () => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "personal", teamId: null });
    expect(await resolveNewFileProjectId(prisma, "member", 7)).toBe(7);
    expect(mocks.projectRole).not.toHaveBeenCalled();
  });

  it("requires a Project for Personal and Self-host files too (COL-008)", async () => {
    for (const scope of [{ mode: "personal", teamId: null }, null]) {
      vi.mocked(currentTeamScope).mockReturnValue(scope as any);
      for (const empty of [null, undefined, "", "null"]) {
        await expect(resolveNewFileProjectId(prisma, "member", empty)).rejects.toMatchObject({ status: 400, message: "A project is required" });
      }
    }
  });
});
