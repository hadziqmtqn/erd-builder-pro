import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), publish: vi.fn() }));
vi.mock("../../lib/prisma.js", () => ({ prisma: { $queryRawUnsafe: mocks.query } }));
vi.mock("../../lib/notifications.js", () => ({ createNotifications: mocks.create }));
vi.mock("../../lib/cloud-live-sync.js", () => ({ publishUserNotification: mocks.publish }));

import { notifyThreadMessage, threadLink, threadRecipients, type ThreadNotice } from "./discussion-notifications.js";

const UID = "1eb51217-906c-4fed-822d-80b5c058832d";
const notice = (overrides: Partial<ThreadNotice> = {}): ThreadNotice => ({
  kind: "discussion",
  threadId: "thread-1",
  messageId: "message-9",
  actorId: "jay",
  teamId: "team-1",
  projectId: 7,
  projectName: "QA BUG-045 rc.54",
  file: { featureType: "diagram", id: 10, uid: UID, label: "QA rc.63 ERD-004" },
  ...overrides,
});

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue([{ userId: "anind" }, { userId: "hadziq" }]);
  mocks.create.mockReset().mockResolvedValue(2);
  mocks.publish.mockReset().mockResolvedValue(undefined);
});

describe("discussion reply notifications (NOT-001.3)", () => {
  it("asks only for the creator and earlier authors who are active Team members, without the replier", async () => {
    await threadRecipients(notice());

    const [sql, ...values] = mocks.query.mock.calls[0];
    expect(values).toEqual(["thread-1", "team-1", "jay"]);
    expect(sql).toContain(`FROM "discussion_threads" t`);
    expect(sql).toContain(`t."created_by"`);
    expect(sql).toContain(`m."author_id"`);
    expect(sql).toContain(`tm."status" = 'active'`);
    expect(sql).toContain(`p."user_id" <> $3`);
    expect(sql).not.toContain(`fo."user_id"`);
  });

  it("stores one metadata-only row per recipient and wakes their notification sockets", async () => {
    await expect(notifyThreadMessage(notice())).resolves.toEqual(["anind", "hadziq"]);

    const inputs = mocks.create.mock.calls[0][0];
    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toEqual({
      recipientUserId: "anind",
      actorUserId: "jay",
      scopeType: "file",
      teamId: "team-1",
      projectId: 7,
      featureType: "diagram",
      fileId: UID,
      type: "discussion.reply",
      entityType: "discussion",
      entityId: "thread-1",
      groupKey: "discussion:thread-1",
      link: `/diagrams/${UID}?thread=thread-1`,
      sourceEventId: "discussion.reply:message-9",
      payload: { fileName: "QA rc.63 ERD-004", projectName: "QA BUG-045 rc.54" },
    });
    expect(inputs[1].recipientUserId).toBe("hadziq");
    expect(mocks.publish).toHaveBeenCalledWith(["anind", "hadziq"]);
  });

  it("points a Project-only thread to the Project page", async () => {
    await notifyThreadMessage(notice({ file: null }));

    expect(mocks.create.mock.calls[0][0][0]).toMatchObject({
      scopeType: "project",
      featureType: null,
      fileId: null,
      link: "/projects/7",
      payload: { fileName: null, projectName: "QA BUG-045 rc.54" },
    });
  });

  it("builds file links per feature, encodes them and falls back to the numeric id", () => {
    expect(threadLink({ kind: "discussion", threadId: "a b", projectId: 7, file: { featureType: "note", id: 3, uid: null, label: "N" } })).toBe("/notes/3?thread=a%20b");
    expect(threadLink({ kind: "discussion", threadId: "t", projectId: 7, file: { featureType: "flowchart", id: 4, uid: "f-uid", label: "F" } })).toBe("/flowcharts/f-uid?thread=t");
    expect(threadLink({ kind: "comment", threadId: "t", projectId: 7, file: { featureType: "drawing", id: 5, uid: "d-uid", label: "D" } })).toBe("/drawings/d-uid?comment=t");
  });

  it("does nothing when nobody else is in the thread", async () => {
    mocks.query.mockResolvedValue([]);

    await expect(notifyThreadMessage(notice())).resolves.toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("never fails the reply when storing notifications fails", async () => {
    mocks.create.mockRejectedValue(new Error("database down"));

    await expect(notifyThreadMessage(notice())).resolves.toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});

describe("comment notifications (NOT-001.4)", () => {
  it("also asks for the file's creator, through the same active Team member filter", async () => {
    await threadRecipients(notice({ kind: "comment", file: { featureType: "flowchart", id: 4, uid: "f-uid", label: "F" } }));

    const [sql, ...values] = mocks.query.mock.calls[0];
    expect(values).toEqual(["thread-1", "team-1", "jay", 4]);
    expect(sql).toContain(`FROM "comment_threads" t`);
    expect(sql).toContain(`FROM "comment_messages" m`);
    expect(sql).toContain(`FROM "flowcharts" fo WHERE fo."id" = $4`);
    expect(sql).toContain(`tm."status" = 'active'`);
  });

  it("stores comment.created with the node label and a ?comment= link, never the comment text", async () => {
    mocks.query.mockResolvedValueOnce([{ userId: "anind" }]).mockResolvedValueOnce([{ anchorLabel: "users" }]);

    await expect(notifyThreadMessage(notice({ kind: "comment" }))).resolves.toEqual(["anind"]);

    expect(mocks.query.mock.calls[1]).toEqual([expect.stringContaining(`FROM "comment_threads"`), "thread-1"]);
    expect(mocks.create.mock.calls[0][0]).toEqual([{
      recipientUserId: "anind",
      actorUserId: "jay",
      scopeType: "file",
      teamId: "team-1",
      projectId: 7,
      featureType: "diagram",
      fileId: UID,
      type: "comment.created",
      entityType: "comment",
      entityId: "thread-1",
      groupKey: "comment:thread-1",
      link: `/diagrams/${UID}?comment=thread-1`,
      sourceEventId: "comment.created:message-9",
      payload: { fileName: "QA rc.63 ERD-004", projectName: "QA BUG-045 rc.54", anchorLabel: "users" },
    }]);
    expect(mocks.publish).toHaveBeenCalledWith(["anind"]);
  });
});
