import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { getInstallationIdentity } from "./installation-identity";

const originalIdentityPath = process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
const originalStatePath = process.env.ERDBPRO_LICENSE_STATE_FILE;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (originalIdentityPath === undefined) delete process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE;
  else process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = originalIdentityPath;
  if (originalStatePath === undefined) delete process.env.ERDBPRO_LICENSE_STATE_FILE;
  else process.env.ERDBPRO_LICENSE_STATE_FILE = originalStatePath;
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("installation identity", () => {
  it("creates one stable keypair outside the application database", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "erd-installation-"));
    temporaryDirectories.push(directory);
    const identityPath = path.join(directory, "installation-identity.json");
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = identityPath;

    const first = getInstallationIdentity();
    const second = getInstallationIdentity();

    expect(second).toEqual(first);
    expect(statSync(identityPath).mode & 0o777).toBe(0o600);
    expect(readFileSync(identityPath, "utf8")).not.toContain("license_key");
  });

  it("preserves the installation id from the legacy license state", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "erd-installation-"));
    temporaryDirectories.push(directory);
    process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE = path.join(directory, "installation-identity.json");
    const statePath = path.join(directory, "license-state.json");
    process.env.ERDBPRO_LICENSE_STATE_FILE = statePath;
    writeFileSync(statePath, JSON.stringify({
      version: 1,
      installationId: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
      licenses: {},
    }));

    expect(getInstallationIdentity().installationId).toBe("018f3f7e-1c33-43f2-a4e4-19b55e61d3fa");
  });
});
