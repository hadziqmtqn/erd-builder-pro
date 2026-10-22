import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({ isDesktopMode: () => false }));
vi.mock("node:dns/promises", () => ({ default: { lookup: vi.fn() } }));

import dns from "node:dns/promises";
import { safeAiBaseUrl } from "./ai-security.js";

describe("AI endpoint address validation (QA-001)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

  it.each(["::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:192.168.1.1", "::"])(
    "rejects private IPv6 endpoint %s", async (address) => {
      vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URL", "false");
      vi.mocked(dns.lookup).mockResolvedValue([{ address, family: 6 }] as never);
      await expect(safeAiBaseUrl(`http://[${address}]/v1`, "")).rejects.toThrow("Private AI provider URLs are disabled");
    },
  );

  it("rejects a hostname resolving to a mapped private IPv4 address", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URL", "false");
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "::ffff:7f00:1", family: 6 }] as never);
    await expect(safeAiBaseUrl("https://provider.example/v1", "")).rejects.toThrow("Private AI provider URLs are disabled");
  });

  it("accepts public endpoints and the explicit private-network opt-in", async () => {
    vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URL", "false");
    vi.mocked(dns.lookup).mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
    await expect(safeAiBaseUrl("https://provider.example/v1/", "")).resolves.toBe("https://provider.example/v1");
    vi.stubEnv("AI_ALLOW_PRIVATE_BASE_URL", "true");
    await expect(safeAiBaseUrl("http://[::ffff:127.0.0.1]/v1", "")).resolves.toBe("http://[::ffff:7f00:1]/v1");
  });
});
