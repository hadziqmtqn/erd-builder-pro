import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  },
  file: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), updateMany: vi.fn() },
  teamMember: { findFirst: vi.fn() },
  projectAccessGrant: { findMany: vi.fn() },
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    project: mocks.project,
    diagram: mocks.file,
    note: mocks.file,
    drawing: mocks.file,
    flowchart: mocks.file,
    teamMember: mocks.teamMember,
    projectAccessGrant: mocks.projectAccessGrant,
  },
}));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true, s3Client: null, R2_BUCKET_NAME: "" }));
vi.mock("../../lib/storage.js", () => ({ getStorageClientForUser: vi.fn() }));
vi.mock("../teams/service.js", () => ({ canManageTeam: vi.fn().mockResolvedValue(false) }));

import { runWithTeamScope } from "../../lib/team-scope.js";
import { createProject, listProjects, listSelectableProjects, softDeleteProject } from "./service.js";

describe("Team project scope", () => {
  it("lists by active team and creates a shared Team project", async () => {
    await runWithTeamScope({ mode: "team", teamId: "team-1" }, async () => {
      await listProjects("member-1", { limit: 100, offset: 0 });
      await createProject("Shared", "member-1");
    });

    expect(mocks.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { teamId: "team-1", isDeleted: false },
    }));
    expect(mocks.project.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "Shared", teamId: "team-1", userId: "member-1" }),
    }));
  });

  it("lists only the signed-in user's Personal projects", async () => {
    mocks.project.findMany.mockClear();

    await runWithTeamScope({ mode: "personal", teamId: null }, () =>
      listSelectableProjects("member-1")
    );

    expect(mocks.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "member-1", teamId: null, isDeleted: false },
    }));
  });

  it("BUG-056 marks which Team Projects the user may add files to", async () => {
    mocks.project.findMany.mockResolvedValueOnce([
      { id: 1, userId: "member-1" },
      { id: 2, userId: "creator-2" },
      { id: 3, userId: "creator-2" },
      { id: 4, userId: "member-1" },
      { id: 5, userId: "creator-2" },
      { id: 6, userId: "member-1" },
    ]);
    mocks.teamMember.findFirst.mockResolvedValueOnce({ role: "staff" });
    mocks.projectAccessGrant.findMany.mockResolvedValueOnce([
      { projectId: 3, role: "viewer" },
      { projectId: 4, role: "commenter" },
      { projectId: 5, role: "editor" },
      { projectId: 6, role: "viewer" },
    ]);

    const list = await runWithTeamScope({ mode: "team", teamId: "team-1" }, () => listSelectableProjects("member-1"));

    expect(mocks.projectAccessGrant.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "member-1", projectId: { in: [1, 2, 3, 4, 5, 6] } } }));
    // Own Project, default Commenter and Editor may add files; a Viewer and a creator a Manager limited may not (COL-004, COL-007).
    expect(list.map((project) => [project.id, project.canAddFiles])).toEqual([[1, true], [2, true], [3, false], [4, false], [5, true], [6, false]]);
  });

  it("BUG-056 lets a Manager add files to every Team Project, and a Personal workspace owner to their own", async () => {
    mocks.project.findMany.mockResolvedValueOnce([{ id: 3, userId: "creator-2" }, { id: 4, userId: "member-1" }]);
    mocks.teamMember.findFirst.mockResolvedValueOnce({ role: "manager" });
    mocks.projectAccessGrant.findMany.mockResolvedValueOnce([{ projectId: 3, role: "viewer" }, { projectId: 4, role: "commenter" }]);
    const team = await runWithTeamScope({ mode: "team", teamId: "team-1" }, () => listSelectableProjects("member-1"));
    expect(team.map((project) => project.canAddFiles)).toEqual([true, true]);

    mocks.project.findMany.mockResolvedValueOnce([{ id: 9, userId: "member-1" }]);
    const personal = await runWithTeamScope({ mode: "personal", teamId: null }, () => listSelectableProjects("member-1"));
    expect(personal).toEqual([{ id: 9, userId: "member-1", canAddFiles: true }]);
  });

  it("rejects non-creators and cascade deletion across another creator's file", async () => {
    mocks.project.findFirst.mockResolvedValue({ id: 1, userId: "creator-1", teamId: "team-1" });

    await runWithTeamScope({ mode: "team", teamId: "team-1" }, async () => {
      expect(await softDeleteProject(1, "member-1")).toEqual({ success: false });

      mocks.file.findFirst.mockReset();
      mocks.file.findFirst.mockResolvedValueOnce({ id: 9 }).mockResolvedValue(null);
      expect(await softDeleteProject(1, "creator-1")).toEqual({ success: false });
    });

    expect(mocks.project.updateMany).not.toHaveBeenCalled();
  });
});
