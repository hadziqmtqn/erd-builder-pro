import { describe, expect, it } from "vitest";
import { assertMcpInstallMode, noteTextToHtml } from "./service.js";

describe("MCP safety boundary", () => {
  it("rejects web modes and escapes appended note text", () => {
    expect(() => assertMcpInstallMode("web")).toThrow(/Desktop and CLI/);
    expect(() => assertMcpInstallMode("cli")).not.toThrow();
    expect(noteTextToHtml('<img src=x onerror="bad">\nhello & bye'))
      .toBe("<p>&lt;img src=x onerror=&quot;bad&quot;&gt;<br>hello &amp; bye</p>");
  });
});
