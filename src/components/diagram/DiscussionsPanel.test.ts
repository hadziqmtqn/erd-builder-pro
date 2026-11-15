import { describe, expect, it } from "vitest";
import { getActiveDetailRefreshTarget, isCommentAnchorForFeature, linkedThreadId } from "./DiscussionsPanel";

describe("notification links (NOT-001.3)", () => {
  const uid = "1eb51217-906c-4fed-822d-80b5c058832d";

  it("opens the linked thread in the panel of the file in the URL path", () => {
    expect(linkedThreadId("?thread=thread-1", `/diagrams/${uid}`, uid)).toBe("thread-1");
    expect(linkedThreadId("?thread=thread-1&feature=x", `/diagrams/${encodeURIComponent(uid)}`, uid)).toBe("thread-1");
  });

  it("leaves the link to that file's panel and ignores a missing thread", () => {
    expect(linkedThreadId("?thread=thread-1", "/diagrams/other-file", uid)).toBeNull();
    expect(linkedThreadId("", `/diagrams/${uid}`, uid)).toBeNull();
    expect(linkedThreadId("?thread=", `/diagrams/${uid}`, uid)).toBeNull();
    expect(linkedThreadId("?thread=t", "/diagrams/%E0%A4%A", uid)).toBeNull();
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
