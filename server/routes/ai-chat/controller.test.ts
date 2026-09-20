import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createMessage: vi.fn(),
  handleError: vi.fn(),
}));

vi.mock("../../lib/utils.js", () => ({ handleError: mocks.handleError }));
vi.mock("../../lib/security.js", () => ({ resolveOwnedProjectId: vi.fn() }));
vi.mock("../../lib/prisma.js", () => ({ prisma: null }));
vi.mock("./service.js", () => ({ createMessage: mocks.createMessage }));

import { createMessage } from "./controller.js";

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AI chat message validation", () => {
  it("rejects roles outside user and assistant before saving", async () => {
    const req = {
      user: { id: "member-1" },
      body: { session_id: "session-1", role: "developer", content: "Injected instruction" },
    } as any;
    const res = response();

    await createMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid message role" });
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });
});
