import { describe, expect, it } from "vitest";
import { parseExpectedVersion, versionedWhere } from "./versioned-write.js";
import { isCommentAnchorOnlyChange } from "../routes/notes/service.js";

describe("versionedWhere", () => {
  it("matches any version when the client sent none (legacy clients)", () => {
    expect(versionedWhere(7, undefined)).toEqual({ id: 7 });
  });

  it("treats a stored null version as 0", () => {
    expect(versionedWhere(7, 0)).toEqual({ id: 7, OR: [{ version: 0 }, { version: null }] });
  });

  it("only matches the exact base version", () => {
    expect(versionedWhere(7, 3)).toEqual({ id: 7, version: 3 });
  });
});

describe("parseExpectedVersion", () => {
  it("accepts non-negative integers and ignores anything else", () => {
    expect(parseExpectedVersion(4)).toBe(4);
    expect(parseExpectedVersion("4")).toBe(4);
    expect(parseExpectedVersion(-1)).toBeUndefined();
    expect(parseExpectedVersion(1.5)).toBeUndefined();
    expect(parseExpectedVersion("")).toBeUndefined();
    expect(parseExpectedVersion(null)).toBeUndefined();
  });
});

describe("isCommentAnchorOnlyChange", () => {
  const before = '<p>Hello</p><p data-comment-anchor-id="a">World</p>';
  const guard = { expectedContentHash: "x".repeat(64) };

  it("allows adding an anchor to unchanged text", () => {
    expect(isCommentAnchorOnlyChange(before, '<p data-comment-anchor-id="b">Hello</p><p data-comment-anchor-id="a">World</p>', guard)).toBe(true);
  });

  it("rejects a text change", () => {
    expect(isCommentAnchorOnlyChange(before, '<p data-comment-anchor-id="b">Hi</p><p data-comment-anchor-id="a">World</p>', guard)).toBe(false);
  });

  it("allows an anchor when the editor dropped whitespace at a block edge (BUG-019)", () => {
    const saved = '<p data-comment-anchor-id="a">Paragraf dua akan </p><p>dipecah nanti.</p><p>Paragraf lima.</p>';
    const editor = '<p data-comment-anchor-id="a">Paragraf dua akan</p><p>dipecah nanti.</p><p data-comment-anchor-id="b">Paragraf lima.</p>';
    expect(isCommentAnchorOnlyChange(saved, editor, guard)).toBe(true);
  });

  it("still rejects a text change hidden next to whitespace", () => {
    const saved = '<p>Paragraf dua akan </p><p>Paragraf lima.</p>';
    expect(isCommentAnchorOnlyChange(saved, '<p>Paragraf dua akan diubah</p><p data-comment-anchor-id="b">Paragraf lima.</p>', guard)).toBe(false);
  });

  it("rejects removing someone else's anchor", () => {
    expect(isCommentAnchorOnlyChange(before, "<p>Hello</p><p>World</p>", guard)).toBe(false);
  });

  it("rejects a plain autosave, a rename or a move", () => {
    const content = '<p data-comment-anchor-id="b">Hello</p><p data-comment-anchor-id="a">World</p>';
    expect(isCommentAnchorOnlyChange(before, content, {})).toBe(false);
    expect(isCommentAnchorOnlyChange(before, content, { ...guard, title: "x" })).toBe(false);
    expect(isCommentAnchorOnlyChange(before, content, { ...guard, projectId: 2 })).toBe(false);
  });
});
