import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, update } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../lib/prisma.js", () => ({
  prisma: { userAiConfig: { findFirst, update } },
}));
vi.mock("../../lib/ai-security.js", () => ({
  safeAiBaseUrl: vi.fn(async (url: string | undefined, fallback: string) => url || fallback),
}));
vi.mock("../../lib/ai-credentials.js", () => ({
  isProtectedAiApiKey: vi.fn(() => true),
  protectAiApiKey: vi.fn((value: string) => value),
  revealAiApiKey: vi.fn((value: string) => value),
}));

import { resolveAiConfig } from "./service.js";

describe("resolveAiConfig", () => {
  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
  });

  it("rejects a stale selected model instead of falling back", async () => {
    findFirst.mockResolvedValue({
      id: 1,
      providerId: 1,
      selectedModelId: 99,
      apiKey: "key",
      provider: { code: "gemini", baseUrl: null, isActive: true },
      selectedModel: null,
    });

    await expect(resolveAiConfig({ userId: "user-1" }))
      .rejects.toThrow("Selected AI model is unavailable for this provider");
    expect(update).not.toHaveBeenCalled();
  });
});
