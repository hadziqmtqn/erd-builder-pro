import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { decrypt, encrypt } from "./crypto";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalEncryptionKey = process.env.ERD_ENCRYPTION_KEY;
let tempDir = "";

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalEncryptionKey === undefined) delete process.env.ERD_ENCRYPTION_KEY;
  else process.env.ERD_ENCRYPTION_KEY = originalEncryptionKey;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = "";
});

describe("installed encryption key compatibility", () => {
  it("opens legacy secrets and creates a persistent installation key", () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), "erd-crypto-"));
    process.env.DATABASE_URL = `file:${path.join(tempDir, "data.db")}`;
    process.env.ERD_ENCRYPTION_KEY = "erd-builder-pro-db-connect-key-2024";

    const legacyCiphertext = encrypt("existing API key");
    delete process.env.ERD_ENCRYPTION_KEY;

    expect(decrypt(legacyCiphertext)).toBe("existing API key");
    expect(existsSync(path.join(tempDir, ".erd-encryption-key"))).toBe(true);
    expect(decrypt(encrypt("new API key"))).toBe("new API key");
  });
});
