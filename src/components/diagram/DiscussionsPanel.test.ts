import { describe, expect, it } from "vitest";
import { getActiveDetailRefreshTarget, isCommentAnchorForFeature, linkedThread, newActivityLabel, normalizeThread, threadsWithNewActivity } from "./DiscussionsPanel";

describe("new activity for the header toast (BUG-072)", () => {
  const thread = (id: string, latestMessageId: string | null, latestAuthorId: string | null, unread = false) => ({ id, latestMessageId, latestAuthorId, unread });
  const ids = (threads: Array<{ id: string }>) => threads.map((item) => item.id);

  it("reports a known thread whose latest message from someone else changed", () => {
    expect(ids(threadsWithNewActivity([thread("t1", "m2", "jay")], new Map([["t1", "m1"]]), "anind"))).toEqual(["t1"]);
  });

  it("ignores own messages, unchanged threads and threads without messages", () => {
    const seen = new Map([["t1", "m1"], ["t2", "m5"]]);
    expect(threadsWithNewActivity([thread("t1", "m2", "anind"), thread("t2", "m5", "jay", true), thread("t3", null, null, true)], seen, "anind")).toEqual([]);
  });

  it("reports an unseen unread thread, such as a new comment from the other tab, but not an unseen read one", () => {
    expect(ids(threadsWithNewActivity([thread("c1", "m9", "jay", true), thread("c2", "m8", "jay")], new Map(), "anind"))).toEqual(["c1"]);
  });

  it("names the open file for a comment, whose row has the numeric file id and no file name", () => {
    // Shape of GET /api/projects/:id/comments rows (listComments): no contexts, no fileName.
    const comment = normalizeThread({
      id: "c1", featureType: "diagram", fileId: "1", anchorType: "table", anchorId: "orders", anchorLabel: "ORDERS",
      status: "open", canDelete: false, latestMessageId: "m1", latestMessage: "Check this", latestAuthorId: "jay",
      lastMessageAt: "2026-11-16T10:00:00.000Z", previewMessages: [], unread: true,
    });
    expect(newActivityLabel(comment, true, "QA PR341 ERD-001 relationships")).toBe("New activity in QA PR341 ERD-001 relationships");
  });

  it("names a discussion's own file, or the Project when it has none", () => {
    const discussion = (fileName: string | null) => normalizeThread({ id: "d1", featureType: "diagram", fileId: "2", fileName, latestMessageId: "m2", latestAuthorId: "jay", unread: true });
    expect(newActivityLabel(discussion("Billing ERD"), false, "Open file")).toBe("New activity in Billing ERD");
    expect(newActivityLabel(discussion(null), false, "Open file")).toBe("New activity in Project discussion");
  });
});

describe("notification links (NOT-001.3, NOT-001.4)", () => {
  const uid = "1eb51217-906c-4fed-822d-80b5c058832d";

  it("opens the linked discussion or comment in the panel of the file in the URL path", () => {
    expect(linkedThread("?thread=thread-1", `/diagrams/${uid}`, uid)).toEqual({ kind: "discussion", threadId: "thread-1" });
    expect(linkedThread("?thread=thread-1&feature=x", `/diagrams/${encodeURIComponent(uid)}`, uid)).toEqual({ kind: "discussion", threadId: "thread-1" });
    expect(linkedThread("?comment=comment-1", `/flowcharts/${uid}`, uid)).toEqual({ kind: "comment", threadId: "comment-1" });
  });

  it("leaves the link to that file's panel and ignores a missing thread", () => {
    expect(linkedThread("?thread=thread-1", "/diagrams/other-file", uid)).toBeNull();
    expect(linkedThread("?comment=comment-1", "/diagrams/other-file", uid)).toBeNull();
    expect(linkedThread("", `/diagrams/${uid}`, uid)).toBeNull();
    expect(linkedThread("?thread=&comment=", `/diagrams/${uid}`, uid)).toBeNull();
    expect(linkedThread("?thread=t", "/diagrams/%E0%A4%A", uid)).toBeNull();
  });
});

describe("comment anchors by feature type", () => {
  it.each([
    ["diagram", "table", true],
    ["diagram", "relationship", true],
    ["note", "block", true],
    ["drawing", "point", true],
    ["flowchart", "shape", true],
    ["note", "table", false],
    ["drawing", "block", false],
    ["flowchart", "point", false],
    ["flowchart", "general", false],
  ] as const)("validates %s anchor type %s as %s", (featureType, anchorType, allowed) => {
    expect(isCommentAnchorForFeature(featureType, anchorType)).toBe(allowed);
  });
});

describe("active collaboration detail refresh", () => {
  it("targets the selected discussion only while its detail is open", () => {
    expect(getActiveDetailRefreshTarget("thread", "discussions", null, "thread-1")).toEqual({
      kind: "thread",
      threadId: "thread-1",
    });
    expect(getActiveDetailRefreshTarget("list", "discussions", null, "thread-1")).toBeNull();
    expect(getActiveDetailRefreshTarget("thread", "discussions", null, null)).toBeNull();
  });

  it("targets the active anchor for a comment detail", () => {
    expect(getActiveDetailRefreshTarget("thread", "comments", { type: "table", id: "table-1" }, "thread-1")).toEqual({
      kind: "anchor",
      anchor: { type: "table", id: "table-1" },
      threadId: "thread-1",
    });
  });
});
