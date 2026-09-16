import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdminUser: vi.fn(),
  savePrompt: vi.fn(),
}));

vi.mock("../../lib/security.js", () => ({
  isAdminUser: mocks.isAdminUser,
  requireAdmin: vi.fn(),
}));

vi.mock("../../lib/utils.js", () => ({ handleError: vi.fn() }));
vi.mock("./service.js", () => ({
  savePrompt: mocks.savePrompt,
}));

import { savePrompt } from "./controller.js";

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  mocks.isAdminUser.mockReset();
  mocks.savePrompt.mockReset();
});

describe("AI settings authorization", () => {
  it("keeps a member prompt personal without emitting an admin rejection", async () => {
    const req = { user: { id: "member-1" }, body: { name: "My prompt", content: "Use DBML" } } as any;
    const res = response();
    mocks.isAdminUser.mockReturnValue(false);
    mocks.savePrompt.mockResolvedValue({ id: "prompt-1" });

    await savePrompt(req, res);

    expect(mocks.savePrompt).toHaveBeenCalledWith("member-1", req.body, false);
    expect(res.json).toHaveBeenCalledWith({ id: "prompt-1" });
  });
});
