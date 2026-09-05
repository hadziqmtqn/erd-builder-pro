import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { generateKeyPairSync, randomUUID } from "node:crypto";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InstallationIdentity = {
  version: 1;
  installationId: string;
  publicKey: string;
  privateKey: string;
};

function licenseStatePath(): string {
  const configured = process.env.ERDBPRO_LICENSE_STATE_FILE?.trim();
  return path.resolve(configured || path.join(process.cwd(), ".erdbpro", "license-state.json"));
}

function identityPath(): string {
  const configured = process.env.ERDBPRO_INSTALLATION_IDENTITY_FILE?.trim();
  if (configured) return path.resolve(configured);
  return path.join(path.dirname(licenseStatePath()), "installation-identity.json");
}

function readLegacyInstallationId(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(licenseStatePath(), "utf8")) as { installationId?: unknown };
    return typeof parsed.installationId === "string" && UUID_V4.test(parsed.installationId)
      ? parsed.installationId
      : null;
  } catch {
    return null;
  }
}

function writeIdentity(identity: InstallationIdentity): void {
  const destination = identityPath();
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(identity, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
  chmodSync(destination, 0o600);
}

function isIdentity(value: unknown): value is InstallationIdentity {
  const identity = value as Partial<InstallationIdentity> | null;
  return Boolean(
    identity &&
    identity.version === 1 &&
    typeof identity.installationId === "string" &&
    UUID_V4.test(identity.installationId) &&
    typeof identity.publicKey === "string" &&
    identity.publicKey.length > 0 &&
    typeof identity.privateKey === "string" &&
    identity.privateKey.length > 0,
  );
}

export function ensureInstallationIdentity(preferredInstallationId?: string): InstallationIdentity {
  const destination = identityPath();
  try {
    const parsed = JSON.parse(readFileSync(destination, "utf8"));
    if (!isIdentity(parsed)) throw new Error("invalid installation identity");
    if (preferredInstallationId && parsed.installationId !== preferredInstallationId) {
      throw new Error("installation identity does not match license state");
    }
    chmodSync(destination, 0o600);
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new Error("INSTALLATION_IDENTITY_INVALID");
    }
  }

  const installationId = preferredInstallationId && UUID_V4.test(preferredInstallationId)
    ? preferredInstallationId
    : readLegacyInstallationId() || randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const identity: InstallationIdentity = {
    version: 1,
    installationId,
    publicKey: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  };
  writeIdentity(identity);
  return identity;
}

export function getInstallationIdentity(): InstallationIdentity {
  return ensureInstallationIdentity();
}
