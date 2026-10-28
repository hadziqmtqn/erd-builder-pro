import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const file = () => ({ findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() });
  return { diagram: file(), drawing: file(), flowchart: file() };
});

vi.mock("../lib/prisma.js", () => ({ prisma: { diagram: mocks.diagram, drawing: mocks.drawing, flowchart: mocks.flowchart } }));
vi.mock("../lib/config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true }));
vi.mock("../lib/entity-history.js", () => ({ captureEntityRevisionSafely: vi.fn() }));
vi.mock("../lib/personal-file-quota.js", () => ({ createPersonalFile: vi.fn() }));
vi.mock("../lib/storage-access.js", () => ({ replacePrivateStorageUrlsInDrawingData: (value: string) => value }));
vi.mock("../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../lib/db-connectors/registry.js", () => ({ fetchSchema: vi.fn(), testConnection: vi.fn() }));
vi.mock("../lib/crypto.js", () => ({ encrypt: vi.fn() }));

import { runWithTeamScope } from "../lib/team-scope.js";
import { saveDiagram } from "./diagrams/save-service.js";
import { updateDiagram } from "./diagrams/service.js";
import { updateDrawing } from "./drawings/service.js";
import { updateFlowchart } from "./flowcharts/service.js";

const stored = { id: 1, uid: "file-1", userId: "creator", title: "File", name: "File", data: "{}", projectId: 7, version: 3, updatedAt: new Date() };

const updaters = [
  { name: "Drawing", model: mocks.drawing, update: (userId: string, extra: object) => updateDrawing("file-1", userId, { title: "New", expectedVersion: 3, ...extra }) },
  { name: "Flowchart", model: mocks.flowchart, update: (userId: string, extra: object) => updateFlowchart("file-1", userId, { title: "New", expectedVersion: 3, ...extra }) },
  { name: "ERD", model: mocks.diagram, update: (userId: string, extra: object) => updateDiagram("file-1", userId, { name: "New", ...extra }) },
];

function inTeam<T>(run: () => Promise<T>): Promise<T> {
  return runWithTeamScope({ mode: "team", teamId: "team-1" }, run) as Promise<T>;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const { model } of updaters) {
    model.findFirst.mockResolvedValue(stored);
    model.updateMany.mockResolvedValue({ count: 1 });
    model.update.mockResolvedValue({});
    model.findUnique.mockResolvedValue({ version: 4, updatedAt: new Date() });
  }
});

describe.each(updaters)("$name update authorization (COL-004)", ({ model, update }) => {
  it("looks the file up with the Editor, Manager, Project-creator and file-creator filter", async () => {
    await inTeam(() => update("member", {}));
    const where = JSON.stringify(model.findFirst.mock.calls[0][0].where);
    expect(where).toContain('{"userId":"member"}');
    expect(where).toContain('{"project":{"userId":"member","accessGrants":{"none":{"userId":"member"}}}}');
    expect(where).toContain('"role":"manager"');
    expect(where).toContain('"accessGrants":{"some":{"userId":"member","role":"editor"}}');
    expect(where).toContain('"project":{"teamId":"team-1"}');
  });

  it("answers a generic not-found when the filter finds nothing, and writes nothing", async () => {
    model.findFirst.mockResolvedValue(null);
    expect(await inTeam(() => update("commenter", {}))).toBeNull();
    expect(model.update).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();
  });

  it("lets an Editor rename or save without changing the Project", async () => {
    expect(await inTeam(() => update("editor", {}))).not.toBeNull();
    expect(await inTeam(() => update("editor", { projectId: 7 }))).not.toBeNull();
  });

  it("refuses to let anyone but the file creator move it to another Project", async () => {
    model.update.mockClear();
    model.updateMany.mockClear();
    expect(await inTeam(() => update("editor", { projectId: 9 }))).toBeNull();
    expect(await inTeam(() => update("editor", { projectId: null }))).toBeNull();
    expect(model.update).not.toHaveBeenCalled();
    expect(model.updateMany).not.toHaveBeenCalled();

    expect(await inTeam(() => update("creator", { projectId: 9 }))).not.toBeNull();
  });
});

describe("ERD autosave authorization (COL-004)", () => {
  it("saves through the same Editor, Manager, Project-creator and file-creator filter", async () => {
    mocks.diagram.findFirst.mockResolvedValue(null);
    expect(await inTeam(() => saveDiagram("11111111-1111-4111-8111-111111111111", "commenter", { expectedVersion: 3 }))).toBeNull();
    const where = JSON.stringify(mocks.diagram.findFirst.mock.calls[0][0].where);
    expect(where).toContain('"accessGrants":{"some":{"userId":"commenter","role":"editor"}}');
    expect(where).toContain('{"userId":"commenter"}');
    expect(mocks.diagram.updateMany).not.toHaveBeenCalled();
  });
});
