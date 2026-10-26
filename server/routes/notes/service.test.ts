import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  note: { create: vi.fn(async (args: any) => args.data), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
}));

vi.mock("../../lib/prisma.js", () => ({ prisma: { note: mocks.note } }));
vi.mock("../../lib/config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true }));
vi.mock("../../lib/entity-history.js", () => ({ captureEntityRevisionSafely: vi.fn() }));
vi.mock("../../lib/personal-file-quota.js", () => ({ createPersonalFile: vi.fn((_feature, _userId, create) => create({ note: mocks.note })) }));
vi.mock("../../lib/storage-access.js", () => ({ replacePrivateStorageUrls: (value: string) => value }));

import { runWithTeamScope } from "../../lib/team-scope.js";
import { createNote, restoreCommentAnchors, updateNote } from "./service.js";

const existing = { id: 1, uid: "note-1", userId: "creator", title: "Spec", content: "<p>Hello</p>", projectId: 7, version: 3, updatedAt: new Date(), isDeleted: false };
const anchored = '<p data-comment-anchor-id="a1">Hello</p>';

function inTeam(run: () => Promise<unknown>) {
  return runWithTeamScope({ mode: "team", teamId: "team-1" }, run).then((value) => value as any);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.note.findFirst.mockResolvedValue(existing);
  mocks.note.updateMany.mockResolvedValue({ count: 1 });
  mocks.note.findUnique.mockResolvedValue({ version: 4, updatedAt: new Date() });
});

describe("Note creation identifiers (DATA-003)", () => {
  it("generates distinct UUIDs when API callers omit uid", async () => {
    await createNote({ title: "First", userId: "creator" });
    await createNote({ title: "Second", userId: "creator" });
    const [first, second] = mocks.note.create.mock.calls.map(([args]) => args.data);
    expect(first.uid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second.uid).not.toBe(first.uid);
  });

  it("preserves the UUID supplied by the client", async () => {
    const uid = "2e571b3a-dc8c-4f45-8dfc-25d424dcac29";
    await createNote({ title: "Client", userId: "creator", uid });
    expect(mocks.note.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ uid }) }));
  });
});

describe("Note update authorization (COL-004)", () => {
  it("lets the creator save without any role lookup", async () => {
    const result = await inTeam(() => updateNote("note-1", "creator", { content: "<p>Changed</p>", expectedVersion: 3 }));
    expect(result.success).toBe(true);
    expect(mocks.note.count).not.toHaveBeenCalled();
    expect(mocks.note.updateMany).toHaveBeenCalledOnce();
  });

  it("lets an Editor, Manager or Project creator save another member's Note", async () => {
    mocks.note.count.mockResolvedValueOnce(1);
    const result = await inTeam(() => updateNote("note-1", "editor", { content: "<p>Changed</p>", expectedVersion: 3 }));
    expect(result.success).toBe(true);
    expect(mocks.note.updateMany).toHaveBeenCalledOnce();
  });

  it("rejects a content change from a Commenter or Viewer with a generic not-found", async () => {
    mocks.note.count.mockResolvedValue(0);
    expect(await inTeam(() => updateNote("note-1", "commenter", { content: "<p>Changed</p>", expectedVersion: 3 }))).toBeNull();
    expect(await inTeam(() => updateNote("note-1", "commenter", { title: "Renamed", expectedVersion: 3 }))).toBeNull();
    expect(mocks.note.updateMany).not.toHaveBeenCalled();
  });

  it("lets a Commenter add only a comment anchor, guarded by the content check", async () => {
    mocks.note.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const result = await inTeam(() => updateNote("note-1", "commenter", { content: anchored, expectedContent: existing.content }));
    expect(result.success).toBe(true);
    expect(mocks.note.updateMany).toHaveBeenCalledOnce();
  });

  it("rejects the same anchor-only change from a Viewer", async () => {
    mocks.note.count.mockResolvedValue(0);
    expect(await inTeam(() => updateNote("note-1", "viewer", { content: anchored, expectedContent: existing.content }))).toBeNull();
    expect(mocks.note.updateMany).not.toHaveBeenCalled();
  });

  it("asks the database for both permissions with the Editor and the non-Viewer filters", async () => {
    mocks.note.count.mockResolvedValue(0);
    await inTeam(() => updateNote("note-1", "commenter", { content: anchored, expectedContent: existing.content }));
    const [editable, commentable] = mocks.note.count.mock.calls.map(([args]) => JSON.stringify(args.where));
    expect(editable).toContain('"accessGrants":{"some":{"userId":"commenter","role":"editor"}}');
    expect(commentable).toContain('"NOT":{"project":{"accessGrants":{"some":{"userId":"commenter","role":"viewer"}}}}');
  });

  it("lets only the creator move the Note to another Project", async () => {
    mocks.note.count.mockResolvedValue(1);
    expect(await inTeam(() => updateNote("note-1", "editor", { projectId: 9, expectedVersion: 3 }))).toBeNull();
    expect(mocks.note.updateMany).not.toHaveBeenCalled();

    expect((await inTeam(() => updateNote("note-1", "creator", { projectId: 9, expectedVersion: 3 }))).success).toBe(true);
  });

  it("lets an Editor resend the same Project without it counting as a move", async () => {
    mocks.note.count.mockResolvedValue(1);
    const result = await inTeam(() => updateNote("note-1", "editor", { projectId: 7, content: "<p>Changed</p>", expectedVersion: 3 }));
    expect(result.success).toBe(true);
  });
});

describe("Comment anchors survive the creator's save (BUG-020)", () => {
  const stored = '<p>Block A</p><p data-comment-anchor-id="m2">Block B</p>';

  it("restores an anchor the writer never received while keeping the writer's edits", () => {
    expect(restoreCommentAnchors(stored, "<p>Block A edited</p><p>Block B</p>"))
      .toBe('<p>Block A edited</p><p data-comment-anchor-id="m2">Block B</p>');
  });

  it("drops the anchor when its block was edited or removed", () => {
    expect(restoreCommentAnchors(stored, "<p>Block A</p><p>Block B changed</p>")).toBe("<p>Block A</p><p>Block B changed</p>");
    expect(restoreCommentAnchors(stored, "<p>Block A</p>")).toBe("<p>Block A</p>");
  });

  it("matches repeated text by occurrence and leaves present anchors alone", () => {
    expect(restoreCommentAnchors('<p>Same</p><p data-comment-anchor-id="b">Same</p>', "<p>Same</p><p>Same</p>"))
      .toBe('<p>Same</p><p data-comment-anchor-id="b">Same</p>');
    expect(restoreCommentAnchors(stored, '<p data-comment-anchor-id="x">Block A</p><p data-comment-anchor-id="m2">Block B</p>'))
      .toBe('<p data-comment-anchor-id="x">Block A</p><p data-comment-anchor-id="m2">Block B</p>');
  });

  it("does not bump the version when a Commenter adds an anchor", async () => {
    mocks.note.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    await inTeam(() => updateNote("note-1", "commenter", { content: anchored, expectedContent: existing.content }));
    expect(mocks.note.updateMany.mock.calls[0][0].data).not.toHaveProperty("version");
  });

  it("keeps the stored anchor when the creator saves an older copy", async () => {
    mocks.note.findFirst.mockResolvedValue({ ...existing, content: stored });
    const result = await inTeam(() => updateNote("note-1", "creator", { content: "<p>Block A edited</p><p>Block B</p>", expectedVersion: 3 }));
    expect(result.success).toBe(true);
    const [{ where, data }] = mocks.note.updateMany.mock.calls[0];
    expect(where).toMatchObject({ id: 1, version: 3, content: stored });
    expect(data.content).toBe('<p>Block A edited</p><p data-comment-anchor-id="m2">Block B</p>');
  });

  it("retries once when an anchor was saved after the read", async () => {
    mocks.note.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    mocks.note.findUnique.mockResolvedValueOnce({ version: 3, content: stored }).mockResolvedValue({ version: 4, updatedAt: new Date() });
    mocks.note.findFirst.mockResolvedValue({ ...existing, content: "<p>Block A</p><p>Block B</p>" });
    const result = await inTeam(() => updateNote("note-1", "creator", { content: "<p>Block A edited</p><p>Block B</p>", expectedVersion: 3 }));
    expect(result.success).toBe(true);
    expect(mocks.note.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.note.updateMany.mock.calls[1][0].data.content).toBe('<p>Block A edited</p><p data-comment-anchor-id="m2">Block B</p>');
  });

  it("still reports a conflict when another editor changed the text", async () => {
    mocks.note.updateMany.mockResolvedValue({ count: 0 });
    mocks.note.findUnique.mockResolvedValue({ version: 4, content: "<p>Someone else</p>" });
    const result = await inTeam(() => updateNote("note-1", "creator", { content: "<p>Mine</p>", expectedVersion: 3 }));
    expect(result).toMatchObject({ success: false, conflict: true, currentVersion: 4 });
  });
});
