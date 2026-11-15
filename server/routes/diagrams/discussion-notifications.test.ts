import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), create: vi.fn(), publish: vi.fn() }));
vi.mock("../../lib/prisma.js", () => ({ prisma: { $queryRawUnsafe: mocks.query } }));
vi.mock("../../lib/notifications.js", () => ({ createNotifications: mocks.create }));
vi.mock("../../lib/cloud-live-sync.js", () => ({ publishCloudUserNotification: mocks.publish }));

import { discussionReplyLink, discussionReplyRecipients, notifyDiscussionReply, type ReplyNotice } from "./discussion-notifications.js";

const UID = "1eb51217-906c-4fed-822d-80b5c058832d";
const notice = (overrides: Partial<ReplyNotice> = {}): ReplyNotice => ({
  threadId: "thread-1",
  messageId: "message-9",
  actorId: "jay",
  teamId: "team-1",
  projectId: 7,
  projectName: "QA BUG-045 rc.54",
  file: { featureType: "diagram", id: 10, uid: UID, label: "QA rc.63 ERD-004" },
  ...overrides,
});

describe("discussion reply notifications (NOT-001.3)", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue([{ userId: "anind" }, { userId: "hadziq" }]);
    mocks.create.mockReset().mockResolvedValue(2);
    mocks.publish.mockReset().mockResolvedValue(undefined);
  });

  it("asks only for the creator and earlier authors who are active Team members, without the replier", async () => {
    await discussionReplyRecipients("thread-1", "team-1", "jay");

    const [sql, ...values] = mocks.query.mock.calls[0];
    expect(values).toEqual(["thread-1", "team-1", "jay"]);
    expect(sql).toContain(`t."created_by"`);
    expect(sql).toContain(`m."author_id"`);
    expect(sql).toContain(`tm."status" = 'active'`);
    expect(sql).toContain(`p."user_id" <> $3`);
  });

  it("stores one metadata-only row per recipient and wakes their sockets outside this Team", async () => {
    await expect(notifyDiscussionReply(notice())).resolves.toEqual(["anind", "hadziq"]);

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
    expect(mocks.publish).toHaveBeenCalledWith(["anind", "hadziq"], "team-1");
  });

  it("points a Project-only thread to the Project page", async () => {
    await notifyDiscussionReply(notice({ file: null }));

    expect(mocks.create.mock.calls[0][0][0]).toMatchObject({
      scopeType: "project",
      featureType: null,
      fileId: null,
      link: "/projects/7",
      payload: { fileName: null, projectName: "QA BUG-045 rc.54" },
    });
  });

  it("builds file links per feature, encodes them and falls back to the numeric id", () => {
    expect(discussionReplyLink({ threadId: "a b", projectId: 7, file: { featureType: "note", id: 3, uid: null, label: "N" } })).toBe("/notes/3?thread=a%20b");
    expect(discussionReplyLink({ threadId: "t", projectId: 7, file: { featureType: "flowchart", id: 4, uid: "f-uid", label: "F" } })).toBe("/flowcharts/f-uid?thread=t");
    expect(discussionReplyLink({ threadId: "t", projectId: 7, file: { featureType: "drawing", id: 5, uid: "d-uid", label: "D" } })).toBe("/drawings/d-uid?thread=t");
  });

  it("does nothing when nobody else is in the thread", async () => {
    mocks.query.mockResolvedValue([]);

    await expect(notifyDiscussionReply(notice())).resolves.toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });

  it("never fails the reply when storing notifications fails", async () => {
    mocks.create.mockRejectedValue(new Error("database down"));

    await expect(notifyDiscussionReply(notice())).resolves.toEqual([]);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
