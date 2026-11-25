import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDesktopMode: vi.fn(() => true),
  isLocalPostgres: vi.fn(() => false),
  isSsoAuthMode: vi.fn(() => false),
  canAddFiles: vi.fn(),
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
// The role rule itself is tested in project-access.test.ts (canAddFilesTo) and against PostgreSQL in access.integration.test.ts.
vi.mock("./project-access.js", () => ({ canAddFilesTo: mocks.canAddFiles }));

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
    mocks.canAddFiles.mockReset();
  });

  it("lets a member who may add files to a Team Project add one", async () => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "team", teamId: "team-1" });
    mocks.canAddFiles.mockResolvedValue(true);
    expect(await resolveNewFileProjectId(prisma, "member", 7)).toBe(7);
    expect(mocks.canAddFiles).toHaveBeenCalledWith(7, "member");
  });

  it("treats a Team Project as missing for a Viewer, a limited creator (COL-007) or a member the Project does not reach", async () => {
    vi.mocked(currentTeamScope).mockReturnValue({ mode: "team", teamId: "team-1" });
    mocks.canAddFiles.mockResolvedValue(false);
    await expect(resolveNewFileProjectId(prisma, "member", 7)).rejects.toMatchObject({ status: 404, message: "Project not found" });
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
    expect(mocks.canAddFiles).not.toHaveBeenCalled();
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
