import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst, update, getRulesOwnerId } = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  getRulesOwnerId: vi.fn(),
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
vi.mock("../ai-rules/service.js", () => ({ getRulesOwnerId }));

import { resolveAiConfig } from "./service.js";

describe("resolveAiConfig", () => {
  beforeEach(() => {
    findFirst.mockReset();
    update.mockReset();
    getRulesOwnerId.mockReset().mockResolvedValue("super-admin-1");
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
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "super-admin-1" }),
    }));
    expect(update).not.toHaveBeenCalled();
  });

  it("uses the SuperAdmin model for a member using shared configuration", async () => {
    findFirst.mockResolvedValue({
      id: 1,
      providerId: 7,
      selectedModelId: 9,
      apiKey: "key",
      provider: { code: "openai", baseUrl: null, isActive: true },
      selectedModel: { providerId: 7, isActive: true, modelIdentifier: "admin-model" },
    });

    const config = await resolveAiConfig({ userId: "member-1", model: "member-override" });

    expect(config.model).toBe("admin-model");
    expect(config.providerCode).toBe("openai");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "super-admin-1" }),
    }));
  });
});
