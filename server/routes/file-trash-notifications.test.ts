import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), updateMany: vi.fn() });
  return { diagram: model(), note: model(), drawing: model(), flowchart: model(), notify: vi.fn() };
});

vi.mock("../lib/prisma.js", () => ({ prisma: { diagram: mocks.diagram, note: mocks.note, drawing: mocks.drawing, flowchart: mocks.flowchart } }));
vi.mock("../lib/file-notifications.js", () => ({ notifyFileTrash: mocks.notify }));
vi.mock("../lib/entity-history.js", () => ({ captureEntityRevisionSafely: vi.fn(), deleteEntityRevisions: vi.fn() }));
vi.mock("../lib/personal-file-quota.js", () => ({ createPersonalFile: vi.fn() }));
vi.mock("../lib/storage-access.js", () => ({ replacePrivateStorageUrls: (value: string) => value, replacePrivateStorageUrlsInDrawingData: (value: string) => value }));

import { restoreDiagram, softDeleteDiagram } from "./diagrams/service.js";
import { restoreNote, softDeleteNote } from "./notes/service.js";
import { restoreDrawing, softDeleteDrawing } from "./drawings/service.js";
import { restoreFlowchart, softDeleteFlowchart } from "./flowcharts/service.js";

const cases = [
  ["diagram", mocks.diagram, softDeleteDiagram, restoreDiagram],
  ["note", mocks.note, softDeleteNote, restoreNote],
  ["drawing", mocks.drawing, softDeleteDrawing, restoreDrawing],
  ["flowchart", mocks.flowchart, softDeleteFlowchart, restoreFlowchart],
] as const;

describe.each(cases)("%s Trash notifications (NOT-001.6)", (feature, model, softDelete, restore) => {
  const file = { id: 3, uid: `${feature}-uid`, projectId: 7, isDeleted: false };

  beforeEach(() => {
    vi.clearAllMocks();
    model.findFirst.mockResolvedValue(file);
    model.updateMany.mockResolvedValue({ count: 1 });
    mocks.notify.mockResolvedValue([]);
  });

  it("notifies once when the file really goes to the Trash, and not again when it is already there", async () => {
    await expect(softDelete(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { id: 3, OR: [{ isDeleted: false }, { isDeleted: null }] },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(mocks.notify).toHaveBeenCalledWith("file.deleted", feature, file, "creator");

    model.updateMany.mockResolvedValue({ count: 0 });
    await expect(softDelete(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("notifies once when a file in the Trash is really restored", async () => {
    await expect(restore(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(model.updateMany).toHaveBeenCalledWith({ where: { id: 3, isDeleted: true }, data: { isDeleted: false, deletedAt: null } });
    expect(mocks.notify).toHaveBeenCalledWith("file.restored", feature, file, "creator");

    model.updateMany.mockResolvedValue({ count: 0 });
    await expect(restore(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
  });

  it("stays not-found and notifies nobody for a file the user did not create", async () => {
    model.findFirst.mockResolvedValue(null);

    await expect(softDelete(file.uid, "someone-else")).resolves.toBeNull();
    await expect(restore(file.uid, "someone-else")).resolves.toBeNull();
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
