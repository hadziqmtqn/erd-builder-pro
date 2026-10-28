import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rows = (prefix: string, days: number[]) => days.map(day => ({ uid: `${prefix}-${day}`, createdAt: new Date(Date.UTC(2026, 9, day)) }));
  const list = (data: any[]) => vi.fn(async (_userId: string, params: { limit: number; offset: number }) => ({
    data: data.slice(params.offset, params.offset + params.limit),
    total: data.length,
  }));
  return {
    notes: list(rows("note", [20, 10])),
    diagrams: list(rows("erd", [25, 5])),
    flowcharts: list(rows("flow", [15])),
    drawings: list(rows("draw", [1])),
    capability: vi.fn(async (_capability: string) => true),
  };
});

vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true, s3Client: null, R2_BUCKET_NAME: "" }));
vi.mock("../../lib/storage.js", () => ({ getStorageClientForUser: vi.fn() }));
vi.mock("../../lib/cloud-capability.js", () => ({ hasActiveCloudCapability: mocks.capability }));
vi.mock("../notes/service.js", () => ({ listNotes: mocks.notes }));
vi.mock("../diagrams/service.js", () => ({ listDiagrams: mocks.diagrams }));
vi.mock("../flowcharts/service.js", () => ({ listFlowcharts: mocks.flowcharts }));
vi.mock("../drawings/service.js", () => ({ listDrawings: mocks.drawings }));

import { listProjectFilePage } from "./service.js";

const base = { projectId: "7", limit: 2, offset: 0, includeDbClient: false };

describe("Project file page (COL-008)", () => {
  beforeEach(() => mocks.capability.mockImplementation(async () => true));

  it("merges every type newest first and pages across them", async () => {
    const first = await listProjectFilePage("u1", { ...base, type: "all" });
    expect(first.data.map(row => row.uid)).toEqual(["erd-25", "note-20"]);
    expect(first.total).toBe(6);
    expect(first.counts).toEqual({ notes: 2, erd: 2, flowchart: 1, "db-client": 0, drawings: 1 });

    const second = await listProjectFilePage("u1", { ...base, type: "all", offset: 2 });
    expect(second.data.map(row => row.uid)).toEqual(["flow-15", "note-10"]);
    expect(second.data[0].type).toBe("flowchart");
  });

  it("pages one type and still counts the others", async () => {
    const page = await listProjectFilePage("u1", { ...base, type: "erd", limit: 1, offset: 1 });
    expect(page.data.map(row => row.uid)).toEqual(["erd-5"]);
    expect(page.total).toBe(2);
    expect(page.counts.notes).toBe(2);
    expect(mocks.diagrams).toHaveBeenLastCalledWith("u1", expect.objectContaining({ limit: 1, offset: 1, projectId: "7", sourceType: "blank" }));
  });

  it("lists nothing of a feature the Cloud Team plan lacks and reports it locked", async () => {
    mocks.capability.mockImplementation(async (capability: string) => capability !== "drawings");
    mocks.drawings.mockClear();
    const page = await listProjectFilePage("u1", { ...base, type: "all", limit: 10 });
    expect(page.locked).toEqual(["drawings"]);
    expect(page.counts.drawings).toBe(0);
    expect(page.data.some(row => row.type === "drawings")).toBe(false);
    expect(mocks.drawings).not.toHaveBeenCalled();
  });
});
