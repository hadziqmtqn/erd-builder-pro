import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicNote: vi.fn(),
  resolveStorage: vi.fn(),
  generateSignedUrl: vi.fn(),
  privateStorageKeysFromMarkup: vi.fn(),
  replacePrivateStorageUrls: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  supabase: { auth: { getUser: mocks.getUser } },
  s3Client: null,
  R2_BUCKET_NAME: "test-bucket",
}));
vi.mock("../../lib/utils.js", () => ({ handleError: vi.fn() }));
vi.mock("../../lib/security.js", () => ({
  resolveNewFileProjectId: vi.fn(),
  resolveOwnedProjectId: vi.fn(),
}));
vi.mock("../../lib/logger.js", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("../../lib/prisma.js", () => ({ prisma: {} }));
vi.mock("./service.js", () => ({ getPublicNote: mocks.getPublicNote }));
vi.mock("../../lib/storage.js", () => ({
  getStorageClientForUser: vi.fn(),
  generateSignedUrl: mocks.generateSignedUrl,
}));
vi.mock("../../lib/storage-access.js", () => ({
  privateStorageKeysFromMarkup: mocks.privateStorageKeysFromMarkup,
  replacePrivateStorageUrls: mocks.replacePrivateStorageUrls,
}));
vi.mock("../common/controller.js", () => ({ resolveStorage: mocks.resolveStorage }));

import { getPublic } from "./controller.js";

function response() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("public Note assets", () => {
  it("replaces private proxy URLs with short-lived signed URLs", async () => {
    const note = {
      uid: "note-1",
      userId: "owner-1",
      title: "Shared note",
      content: '<img src="https://app.test/api/serve/erd-builder-pro/notes/a.png">',
      project: null,
      isDeleted: false,
      isPublic: true,
      expiryDate: null,
      shareToken: null,
    };
    const storage = { s3: {}, config: { type: "r2", bucketName: "bucket" } };
    const req = { params: { uid: note.uid }, cookies: {}, headers: {}, query: {} } as any;
    const res = response();

    mocks.getPublicNote.mockResolvedValue(note);
    mocks.resolveStorage.mockResolvedValue(storage);
    mocks.privateStorageKeysFromMarkup.mockReturnValue(["erd-builder-pro/notes/a.png"]);
    mocks.generateSignedUrl.mockResolvedValue("https://signed.test/a.png");
    mocks.replacePrivateStorageUrls.mockReturnValue('<img src="https://signed.test/a.png">');

    await getPublic(req, res);

    expect(mocks.generateSignedUrl).toHaveBeenCalledWith(
      storage.s3,
      storage.config,
      "erd-builder-pro/notes/a.png",
      900,
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      content: '<img src="https://signed.test/a.png">',
    }));
  });
});
