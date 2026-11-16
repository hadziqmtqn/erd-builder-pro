import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), count: vi.fn() });
  return { diagram: model(), note: model(), drawing: model(), flowchart: model(), trash: vi.fn(), moved: vi.fn() };
});

vi.mock("../lib/prisma.js", () => ({ prisma: { diagram: mocks.diagram, note: mocks.note, drawing: mocks.drawing, flowchart: mocks.flowchart } }));
vi.mock("../lib/file-notifications.js", () => ({ notifyFileTrash: mocks.trash, notifyFileMoved: mocks.moved }));
vi.mock("../lib/entity-history.js", () => ({ captureEntityRevisionSafely: vi.fn(), deleteEntityRevisions: vi.fn() }));
vi.mock("../lib/personal-file-quota.js", () => ({ createPersonalFile: vi.fn() }));
vi.mock("../lib/storage-access.js", () => ({ replacePrivateStorageUrls: (value: string) => value, replacePrivateStorageUrlsInDrawingData: (value: string) => value }));

import { restoreDiagram, softDeleteDiagram, updateDiagram } from "./diagrams/service.js";
import { restoreNote, softDeleteNote, updateNote } from "./notes/service.js";
import { restoreDrawing, softDeleteDrawing, updateDrawing } from "./drawings/service.js";
import { restoreFlowchart, softDeleteFlowchart, updateFlowchart } from "./flowcharts/service.js";

const cases = [
  ["diagram", mocks.diagram, softDeleteDiagram, restoreDiagram, updateDiagram],
  ["note", mocks.note, softDeleteNote, restoreNote, updateNote],
  ["drawing", mocks.drawing, softDeleteDrawing, restoreDrawing, updateDrawing],
  ["flowchart", mocks.flowchart, softDeleteFlowchart, restoreFlowchart, updateFlowchart],
] as const;

describe.each(cases)("%s file notifications (NOT-001.6, NOT-001.7)", (feature, model, softDelete, restore, update) => {
  const file = { id: 3, uid: `${feature}-uid`, userId: "creator", projectId: 7, isDeleted: false, version: 3, content: "<p>Hi</p>", data: "{}" };

  beforeEach(() => {
    vi.clearAllMocks();
    model.findFirst.mockResolvedValue(file);
    model.updateMany.mockResolvedValue({ count: 1 });
    model.update.mockResolvedValue(file);
    model.findUnique.mockResolvedValue({ version: 4, updatedAt: new Date(), content: file.content });
    mocks.trash.mockResolvedValue([]);
    mocks.moved.mockResolvedValue([]);
  });

  it("notifies once when the file really goes to the Trash, and not again when it is already there", async () => {
    await expect(softDelete(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(model.updateMany).toHaveBeenCalledWith({
      where: { id: 3, OR: [{ isDeleted: false }, { isDeleted: null }] },
      data: { isDeleted: true, deletedAt: expect.any(Date) },
    });
    expect(mocks.trash).toHaveBeenCalledWith("file.deleted", feature, file, "creator");

    model.updateMany.mockResolvedValue({ count: 0 });
    await expect(softDelete(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(mocks.trash).toHaveBeenCalledTimes(1);
  });

  it("notifies once when a file in the Trash is really restored", async () => {
    await expect(restore(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(model.updateMany).toHaveBeenCalledWith({ where: { id: 3, isDeleted: true }, data: { isDeleted: false, deletedAt: null } });
    expect(mocks.trash).toHaveBeenCalledWith("file.restored", feature, file, "creator");

    model.updateMany.mockResolvedValue({ count: 0 });
    await expect(restore(file.uid, "creator")).resolves.toEqual({ success: true });
    expect(mocks.trash).toHaveBeenCalledTimes(1);
  });

  it("stays not-found and notifies nobody for a file the user did not create", async () => {
    model.findFirst.mockResolvedValue(null);

    await expect(softDelete(file.uid, "someone-else")).resolves.toBeNull();
    await expect(restore(file.uid, "someone-else")).resolves.toBeNull();
    expect(model.updateMany).not.toHaveBeenCalled();
    expect(mocks.trash).not.toHaveBeenCalled();
  });

  it("hands a successful save with its Project to the move notice, which ignores an unchanged Project", async () => {
    await expect(update(file.uid, "creator", { projectId: 8 })).resolves.toMatchObject({ success: true });

    expect(mocks.moved).toHaveBeenCalledWith(feature, file, 8, "creator");
  });

  it.skipIf(feature === "diagram")("sends no move notice when the save is refused as a conflict", async () => {
    model.updateMany.mockResolvedValue({ count: 0 });

    await expect(update(file.uid, "creator", { projectId: 8 })).resolves.toMatchObject({ success: false, conflict: true });
    expect(mocks.moved).not.toHaveBeenCalled();
  });
});
