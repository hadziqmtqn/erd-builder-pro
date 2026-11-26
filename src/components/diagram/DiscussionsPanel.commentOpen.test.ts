import { describe, expect, it } from "vitest";
import { commentOpenTarget, normalizeThread } from "./DiscussionsPanel";

const comment = (id: string, anchorId = "orders") => normalizeThread({
  id, featureType: "diagram", fileId: "1", anchorType: "table", anchorId, status: "open",
  latestMessageId: `m-${id}`, previewMessages: [], unread: true,
});

describe("opening a node's comments (BUG-087)", () => {
  const linked = { type: "table" as const, id: "orders", threadId: "c2" };
  const marker = { type: "table" as const, id: "orders" };

  it("opens the linked thread when a newer list request superseded this one or it failed", () => {
    // Slow connection: the 15 s poll or a live sync starts a new list request, so this one resolves to null.
    expect(commentOpenTarget(null, linked, false)).toEqual({ screen: "thread", threadId: "c2" });
  });

  it("opens the linked thread when the list is older than the comment", () => {
    expect(commentOpenTarget([], linked, false)).toEqual({ screen: "thread", threadId: "c2" });
    expect(commentOpenTarget([comment("c1")], linked, false)).toEqual({ screen: "thread", threadId: "c2" });
  });

  it("opens the linked thread from a list that has it, and the newest one for a marker click", () => {
    expect(commentOpenTarget([comment("c1"), comment("c2")], linked, false)).toEqual({ screen: "thread", threadId: "c2" });
    expect(commentOpenTarget([comment("c1"), comment("c2")], marker, false)).toEqual({ screen: "thread", threadId: "c1" });
  });

  it("loads the node's threads instead of offering a new comment when the list is unknown", () => {
    expect(commentOpenTarget(null, marker, false)).toEqual({ screen: "thread", threadId: null });
  });

  it("offers a new comment only when a current list has none on that node", () => {
    expect(commentOpenTarget([comment("c9", "customers")], marker, false)).toEqual({ screen: "compose" });
    expect(commentOpenTarget([], marker, true)).toEqual({ screen: "list" });
  });
});
