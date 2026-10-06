import { describe, expect, it } from "vitest";
import { getActiveDetailRefreshTarget, isCommentAnchorForFeature } from "./DiscussionsPanel";

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
