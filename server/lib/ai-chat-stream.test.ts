import { describe, expect, it } from "vitest";
import { createOpenAiStreamContentCollector } from "./ai-chat-stream.js";

describe("OpenAI stream content collector", () => {
  it("collects assistant text across split UTF-8 SSE chunks", () => {
    const collector = createOpenAiStreamContentCollector();
    const encoder = new TextEncoder();
    const response = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Halo " } }] })}\r\n\r\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: "dunia 🌏" } }] })}\n\n`,
      "data: [DONE]",
    ].join("");
    const bytes = encoder.encode(response);

    collector.push(bytes.slice(0, 19));
    collector.push(bytes.slice(19, 48));
    collector.push(bytes.slice(48));

    expect(collector.finish()).toBe("Halo dunia 🌏");
    expect(collector.finish()).toBe("Halo dunia 🌏");
  });
});
