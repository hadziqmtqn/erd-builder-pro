import { describe, expect, it } from "vitest";
import { canStartThread } from "./DiscussionsPanel";

describe("the list's start-thread button (BUG-090)", () => {
  it("is hidden on a Drawing's Comments tab while Drawing comments are paused, for every role", () => {
    expect(canStartThread("comments", "drawing", false)).toBe(false);
    expect(canStartThread("comments", "drawing", true)).toBe(false);
  });

  it("comes back on a Drawing's Comments tab once Drawing comments are enabled", () => {
    expect(canStartThread("comments", "drawing", false, true)).toBe(true);
    expect(canStartThread("comments", "drawing", true, true)).toBe(false);
  });

  it("stays on the ERD, Flowchart and Note Comments tabs and on every Discussions tab", () => {
    expect(canStartThread("comments", "diagram", false)).toBe(true);
    expect(canStartThread("comments", "flowchart", false)).toBe(true);
    expect(canStartThread("comments", "note", false)).toBe(true);
    expect(canStartThread("discussions", "drawing", false)).toBe(true);
    expect(canStartThread("discussions", "diagram", false)).toBe(true);
  });

  it("stays hidden for members without comment access", () => {
    expect(canStartThread("comments", "diagram", true)).toBe(false);
    expect(canStartThread("discussions", "drawing", true)).toBe(false);
  });
});
