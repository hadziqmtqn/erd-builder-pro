export function createOpenAiStreamContentCollector() {
  const decoder = new TextDecoder();
  let pending = "";
  let content = "";
  let finished = false;

  const consumeLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trimStart();
    if (!data || data === "[DONE]") return;
    try {
      const token = JSON.parse(data).choices?.[0]?.delta?.content;
      if (typeof token === "string") content += token;
    } catch {
      // Ignore non-content SSE frames.
    }
  };

  return {
    push(chunk: Uint8Array) {
      if (finished) return;
      pending += decoder.decode(chunk, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      lines.forEach(consumeLine);
    },
    finish() {
      if (!finished) {
        pending += decoder.decode();
        if (pending) consumeLine(pending);
        pending = "";
        finished = true;
      }
      return content;
    },
  };
}
