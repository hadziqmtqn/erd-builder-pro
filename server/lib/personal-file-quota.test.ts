import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  diagramCount: vi.fn(),
  diagramCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("./config.js", () => ({ isSsoAuthMode: () => true }));
vi.mock("./team-scope.js", () => ({
  currentTeamScope: () => ({ mode: "personal", teamId: null }),
  fileScopeWhere: (userId: string) => ({ userId, OR: [{ projectId: null }, { project: { userId, teamId: null } }] }),
}));
vi.mock("./prisma.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

const { createPersonalFile, PersonalFileQuotaError } = await import("./personal-file-quota.js");

describe("Personal Cloud file quota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (db: any) => Promise<unknown>) => callback({
      user: { findUnique: mocks.userFindUnique },
      diagrams: { count: mocks.diagramCount },
    }));
    mocks.userFindUnique.mockResolvedValue({ cloudPersonalEntitlement: null });
  });

  it("rejects the fourth Personal ERD file", async () => {
    mocks.diagramCount.mockResolvedValue(3);

    await expect(createPersonalFile("diagrams", "user-1", mocks.diagramCreate))
      .rejects.toBeInstanceOf(PersonalFileQuotaError);

    expect(mocks.diagramCreate).not.toHaveBeenCalled();
  });

  it("uses a Personal limit received from the Cloud entitlement", async () => {
    mocks.userFindUnique.mockResolvedValue({
      cloudPersonalEntitlement: JSON.stringify({
        revision: "a".repeat(64),
        capabilities: {},
        limits: { max_members: null, max_personal_files_per_feature: 5 },
      }),
    });
    mocks.diagramCount.mockResolvedValue(4);
    mocks.diagramCreate.mockResolvedValue({ id: 1 });

    await expect(createPersonalFile("diagrams", "user-1", mocks.diagramCreate)).resolves.toEqual({ id: 1 });
    expect(mocks.diagramCreate).toHaveBeenCalledWith(expect.anything());
  });
});
