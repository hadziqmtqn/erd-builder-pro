import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), publish: vi.fn() }));
vi.mock("./prisma.js", () => ({ prisma: { $queryRawUnsafe: mocks.query } }));
vi.mock("./notifications.js", () => ({ createNotifications: mocks.create }));
vi.mock("./cloud-live-sync.js", () => ({ publishUserNotification: mocks.publish }));
// Team scope exists only on local PostgreSQL (Cloud and Self-host).
vi.mock("./config.js", async (importOriginal) => ({ ...(await importOriginal<typeof import("./config.js")>()), isLocalPostgres: () => true }));

import { runWithTeamScope } from "./team-scope.js";
import { notifyFileMoved, notifyFileTrash, projectEditors } from "./file-notifications.js";

const inTeam = <T>(run: () => Promise<T>) => runWithTeamScope({ mode: "team", teamId: "team-1" }, run) as Promise<T>;
const diagram = { id: 42, uid: "d-uid", projectId: 7, name: "Sales ERD" };
const PROJECTS = [{ id: 7, name: "Billing" }, { id: 8, name: "Ops" }];

beforeEach(() => {
  mocks.query.mockReset().mockImplementation(async (sql: string, ...values: unknown[]) => {
    if (sql.includes('FROM "projects" WHERE')) return PROJECTS.filter((project) => values.includes(project.id));
    return values[0] === 8 ? [{ userId: "manager" }, { userId: "ops-editor" }] : [{ userId: "manager" }, { userId: "editor" }];
  });
  mocks.create.mockReset().mockResolvedValue(2);
  mocks.publish.mockReset().mockResolvedValue(undefined);
});

describe("file Trash notifications (NOT-001.6)", () => {
  it("asks for the Project creator unless a Manager limited them, every Manager and every Editor, active in the Team, without the actor", async () => {
    await projectEditors(7, "team-1", "jay");

    const [sql, ...values] = mocks.query.mock.calls[0];
    expect(values).toEqual([7, "team-1", "jay"]);
    expect(sql).toContain(`p."team_id" = $2`);
    expect(sql).toContain(`lg."role" IN ('viewer', 'commenter')`);
    expect(sql).toContain(`m."role" = 'manager'`);
    expect(sql).toContain(`g."role" = 'editor'`);
    expect(sql).toContain(`tm."status" = 'active'`);
    expect(sql).toContain(`r."user_id" <> $3`);
  });

  it("tells the Project's editors that a Team file went to the Trash, linking to the Project", async () => {
    await expect(inTeam(() => notifyFileTrash("file.deleted", "diagram", diagram, "jay"))).resolves.toEqual(["manager", "editor"]);

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual({
      recipientUserId: "manager",
      actorUserId: "jay",
      scopeType: "file",
      teamId: "team-1",
      projectId: 7,
      featureType: "diagram",
      fileId: "d-uid",
      type: "file.deleted",
      entityType: "file",
      entityId: "d-uid",
      groupKey: "file:diagram:d-uid",
      link: "/projects/7",
      payload: { fileName: "Sales ERD", projectName: "Billing" },
    });
    expect(mocks.publish).toHaveBeenCalledWith(["manager", "editor"]);
  });

  it("links a restored file to the file itself, by its numeric id when it has no uid", async () => {
    await inTeam(() => notifyFileTrash("file.restored", "flowchart", { id: 5, uid: null, projectId: 7, title: "Flow" }, "jay"));

    expect(mocks.create.mock.calls[0][0][0]).toMatchObject({ type: "file.restored", link: "/flowcharts/5", fileId: "5", payload: { fileName: "Flow", projectName: "Billing" } });
  });

  it("creates nothing outside a Team or without a Project", async () => {
    await expect(notifyFileTrash("file.deleted", "note", diagram, "jay")).resolves.toEqual([]);
    await expect(runWithTeamScope({ mode: "personal", teamId: null }, () => notifyFileTrash("file.deleted", "note", diagram, "jay"))).resolves.toEqual([]);
    await expect(inTeam(() => notifyFileTrash("file.deleted", "note", { ...diagram, projectId: null }, "jay"))).resolves.toEqual([]);

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("does nothing when nobody else runs the Project, and never fails the file action", async () => {
    mocks.query.mockResolvedValue([]);
    await expect(inTeam(() => notifyFileTrash("file.deleted", "drawing", diagram, "jay"))).resolves.toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();

    mocks.query.mockResolvedValue([{ userId: "manager" }]);
    mocks.create.mockRejectedValue(new Error("database down"));
    await expect(inTeam(() => notifyFileTrash("file.deleted", "drawing", diagram, "jay"))).resolves.toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe("file move notifications (NOT-001.7)", () => {
  it("tells the editors of both Projects once each, naming both Projects and linking to the file", async () => {
    await expect(inTeam(() => notifyFileMoved("note", { id: 3, uid: "n-uid", projectId: 7, title: "Spec" }, 8, "jay")))
      .resolves.toEqual(["manager", "editor", "ops-editor"]);

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs).toHaveLength(3);
    expect(inputs[0]).toMatchObject({
      type: "file.moved",
      projectId: 8,
      featureType: "note",
      fileId: "n-uid",
      link: "/notes/n-uid",
      payload: { fileName: "Spec", projectName: "Ops", fromProjectName: "Billing" },
    });
    expect(mocks.publish).toHaveBeenCalledWith(["manager", "editor", "ops-editor"]);
  });

  it("sends nothing for a save that keeps the Project, which autosave does on every save", async () => {
    await expect(inTeam(() => notifyFileMoved("note", { id: 3, projectId: 7 }, 7, "jay"))).resolves.toEqual([]);
    await expect(inTeam(() => notifyFileMoved("note", { id: 3, projectId: 7 }, undefined, "jay"))).resolves.toEqual([]);
    await expect(inTeam(() => notifyFileMoved("note", { id: 3, projectId: null }, 8, "jay"))).resolves.toEqual([]);

    expect(mocks.query).not.toHaveBeenCalled();
  });
});
