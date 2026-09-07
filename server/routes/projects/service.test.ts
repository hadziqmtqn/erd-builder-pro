import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  project: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 1, ...data })),
  },
  file: { findMany: vi.fn().mockResolvedValue([]) },
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
import { createProject, listProjects, listSelectableProjects } from "./service.js";

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
      data: expect.objectContaining({ name: "Shared", teamId: "team-1", userId: null }),
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
});
