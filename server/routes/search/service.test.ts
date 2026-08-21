import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desktop: true,
  diagram: vi.fn(),
  note: vi.fn(),
  drawing: vi.fn(),
  flowchart: vi.fn(),
  dbClient: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: {
    diagram: { findMany: mocks.diagram },
    note: { findMany: mocks.note },
    drawing: { findMany: mocks.drawing },
    flowchart: { findMany: mocks.flowchart },
    dbClient: { findMany: mocks.dbClient },
  },
}));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => mocks.desktop }));

import { listRecentFiles } from "./service.js";

describe("listRecentFiles", () => {
  beforeEach(() => {
    mocks.desktop = true;
    for (const mock of [mocks.diagram, mocks.note, mocks.drawing, mocks.flowchart, mocks.dbClient]) {
      mock.mockReset().mockResolvedValue([]);
    }
  });

  it("sorts by the latest edit and excludes DB Client on web", async () => {
    mocks.desktop = false;
    mocks.diagram.mockResolvedValue([{ id: 1, name: "Yesterday", updatedAt: new Date("2026-08-20T00:00:00Z") }]);
    mocks.note.mockResolvedValue([{ id: 2, title: "Just edited", updatedAt: new Date("2026-08-21T00:00:00Z") }]);

    const files = await listRecentFiles("user-1");

    expect(files.map((file: any) => file.name)).toEqual(["Just edited", "Yesterday"]);
    expect(mocks.dbClient).not.toHaveBeenCalled();
  });
});
