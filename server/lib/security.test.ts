import { describe, expect, it, vi } from "vitest";

vi.mock("./config.js", () => ({ isDesktopMode: () => false, isLocalPostgres: () => true }));

import { resolveNewFileProjectId } from "./security.js";
import { runWithTeamScope } from "./team-scope.js";

describe("new file project scope", () => {
  it("uses the Team Uncategorized project while keeping Personal files projectless", async () => {
    const prisma = {
      project: {
        findFirst: vi.fn().mockResolvedValue({ id: 42 }),
        create: vi.fn(),
      },
    } as any;

    await expect(runWithTeamScope(
      { mode: "team", teamId: "team-1" },
      () => resolveNewFileProjectId(prisma, "user-1", null),
    )).resolves.toBe(42);
    await expect(runWithTeamScope(
      { mode: "personal", teamId: null },
      () => resolveNewFileProjectId(prisma, "user-1", null),
    )).resolves.toBeNull();
  });
});
