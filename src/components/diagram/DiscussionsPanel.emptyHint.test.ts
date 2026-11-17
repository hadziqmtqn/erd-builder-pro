import { describe, expect, it } from "vitest";
import { emptyThreadsHint } from "./DiscussionsPanel";

describe("empty thread list hint per file type (BUG-083)", () => {
  it("says comments are not available on a Drawing instead of naming nodes, for every role", () => {
    expect(emptyThreadsHint("comments", "drawing", false)).toBe("Comments aren't available on drawings.");
    expect(emptyThreadsHint("comments", "drawing", true)).toBe("Comments aren't available on drawings.");
  });

  it("keeps the ERD and Flowchart texts and the Discussions tab text", () => {
    expect(emptyThreadsHint("comments", "diagram", false)).toBe("Use the node context menu to start one.");
    expect(emptyThreadsHint("comments", "flowchart", false)).toBe("Use the node context menu to start one.");
    expect(emptyThreadsHint("comments", "diagram", true)).toBe("You can read threads here, but only members with comment access can start one.");
    expect(emptyThreadsHint("discussions", "drawing", false)).toBe("Start a thread to capture a question or design decision.");
  });
});
