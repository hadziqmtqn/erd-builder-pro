import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("../../lib/config.js", () => ({ supabase: null, useLocalAuth: () => true }));
vi.mock("../../lib/desktop-auth.js", () => ({ getSession: vi.fn() }));
vi.mock("../../lib/cloud-ai.js", () => ({
  getCloudAiAccess: async () => null,
  getCloudAiRuntimeConfig: vi.fn(),
  reserveCloudAiCredit: vi.fn(),
  finalizeCloudAiCredit: vi.fn(),
}));
vi.mock("../ai-chat/service.js", () => ({ createTrustedAssistantMessage: vi.fn() }));
vi.mock("./service.js", () => ({
  resolveAiConfig: async () => ({ apiKey: "key", baseUrl: "https://provider.test/v1", model: "model", providerCode: "openai" }),
  getProxyFetchUrl: () => "https://provider.test/v1/chat/completions",
}));

import { AI_PROVIDER_FIRST_BYTE_TIMEOUT_MS, proxy } from "./controller.js";

function harness() {
  const listeners: Record<string, () => void> = {};
  const res: any = {
    headersSent: false,
    on: (event: string, fn: () => void) => { listeners[event] = fn; },
    status: vi.fn(function (this: any, code: number) { this.code = code; return this; }),
    json: vi.fn(function (this: any, body: unknown) { this.body = body; this.headersSent = true; return this; }),
  };
  const req: any = { body: { messages: [{ role: "user", content: "hi" }] }, user: { id: "u1" }, header: () => undefined, headers: {}, cookies: {} };
  return { req, res, listeners };
}

// The provider never sends headers until the proxy aborts the request.
const stalledProvider = (_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => {
  init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("AI proxy first-byte timeout", () => {
  it("answers 504 instead of leaving the browser waiting when the provider is too slow", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(stalledProvider));
    const { req, res } = harness();
    const done = proxy(req, res);
    await vi.advanceTimersByTimeAsync(AI_PROVIDER_FIRST_BYTE_TIMEOUT_MS);
    await done;
    expect(res.code).toBe(504);
    expect(res.body).toMatchObject({ code: "AI_PROVIDER_TIMEOUT" });
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
  });

  it("sends nothing after the browser itself disconnects", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(stalledProvider));
    const { req, res, listeners } = harness();
    const done = proxy(req, res);
    await vi.advanceTimersByTimeAsync(1_000);
    listeners.close();
    await done;
    expect(res.status).not.toHaveBeenCalled();
  });
});
