import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  teamMemberFindMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindMany: vi.fn(),
  noteFindMany: vi.fn(),
  flowchartFindMany: vi.fn(),
  drawingFindMany: vi.fn(),
  diagramFindMany: vi.fn(),
  entityChangeFindMany: vi.fn(),
  entityChangeFindFirst: vi.fn(),
  readEntity: vi.fn(),
}));

vi.mock("../lib/config.js", () => ({ useLocalAuth: () => true }));
vi.mock("../lib/entity-history.js", () => ({ parseRevisionChanges: () => ({ source: "autosave", snapshot: {} }) }));
vi.mock("../lib/prisma.js", () => ({
  prisma: {
    teamMember: { findMany: mocks.teamMemberFindMany },
    project: { findFirst: mocks.projectFindFirst, findMany: mocks.projectFindMany },
    note: { findMany: mocks.noteFindMany },
    flowchart: { findMany: mocks.flowchartFindMany },
    drawing: { findMany: mocks.drawingFindMany },
    diagram: { findMany: mocks.diagramFindMany },
    entityChange: { findMany: mocks.entityChangeFindMany, findFirst: mocks.entityChangeFindFirst },
  },
}));
vi.mock("../routes/entity-changes/service.js", () => ({ readEntity: mocks.readEntity }));

import { listPublicWorkspaceFiles, readPublicDocument } from "./public-service.js";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.teamMemberFindMany.mockResolvedValue([{ teamId: "team-a" }]);
  mocks.projectFindMany.mockResolvedValue([]);
  mocks.noteFindMany.mockResolvedValue([]);
  mocks.flowchartFindMany.mockResolvedValue([]);
  mocks.drawingFindMany.mockResolvedValue([]);
  mocks.diagramFindMany.mockResolvedValue([]);
});

describe("Public MCP workspace scope", () => {
  it("lists only personal files and files from active member Teams", async () => {
    await listPublicWorkspaceFiles("user-a");

    const where = mocks.noteFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ isDeleted: false });
    expect(where.AND[0].OR).toEqual(expect.arrayContaining([
      { userId: "user-a", projectId: null },
      { userId: "user-a", project: { teamId: null } },
      { project: { teamId: { in: ["team-a"] } } },
    ]));
  });

  it("requires the same Team scope before reading a shared document", async () => {
    mocks.readEntity.mockResolvedValue({
      entity: { uid: "note-a", isDeleted: false, projectId: 2 },
      entityId: "2",
      updatedAt: "2026-09-06T00:00:00.000Z",
      snapshot: { title: "Team note", content: "safe" },
    });
    mocks.projectFindFirst.mockResolvedValue({ id: 2 });

    await expect(readPublicDocument("user-a", "notes", "note-a")).resolves.toMatchObject({ uid: "note-a" });

    expect(mocks.readEntity).toHaveBeenCalledWith("notes", expect.objectContaining({
      AND: expect.arrayContaining([expect.objectContaining({ OR: expect.arrayContaining([
        { project: { teamId: { in: ["team-a"] } } },
      ]) })]),
    }));
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ OR: expect.arrayContaining([
        { teamId: { in: ["team-a"] } },
      ]) }),
    }));
  });
});
