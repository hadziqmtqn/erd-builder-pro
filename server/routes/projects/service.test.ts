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
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    project: mocks.project,
    diagram: mocks.file,
    note: mocks.file,
    drawing: mocks.file,
    flowchart: mocks.file,
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
