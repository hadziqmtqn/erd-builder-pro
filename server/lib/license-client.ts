import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createPublicKey, randomUUID, verify as verifySignature } from "node:crypto";

import { isLocalPostgres } from "./config.js";
import { ensureInstallationIdentity } from "./installation-identity.js";

const PROTOCOL_VERSION = 1;
const PRODUCT_TYPE = "self_host";
const CLIENT_TYPE = "web";
const AUDIENCE = "erd-self-host";
// This is the official production verification key. The matching private key
// stays in the SaaS signing environment and must never be shipped to clients.
const OFFICIAL_LICENSE_PUBLIC_KEY_ID = "production-1";
const OFFICIAL_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEABi1Uek1UFOesLWNtuyL8T7+nZzbWIoBhNeRaQ/6w4Wk=
-----END PUBLIC KEY-----`;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_CANONICAL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CAPABILITY_KEY = /^[a-z][a-z0-9_]*$/;

export type LicenseCapabilities = Readonly<Record<string, boolean>>;

export function normalizeLicenseCapabilities(value: unknown): LicenseCapabilities {
  const capabilities: Record<string, boolean> = {};
  const add = (key: unknown, enabled: unknown) => {
    if (typeof key === "string" && CAPABILITY_KEY.test(key) && enabled === true) {
      capabilities[key] = true;
    }
  };

  if (Array.isArray(value)) {
    for (const feature of value) add(feature, true);
  } else if (value && typeof value === "object") {
    for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) add(key, enabled);
  }

  return capabilities;
}

export type VerifiedEntitlement = {
  licenseId: string;
  installationId: string;
  bindingGeneration: number;
  planCode: string;
  organizationType: "personal" | "team";
  maxMembers: number | null;
  issuedAt: number;
  expiresAt: number;
  features: LicenseCapabilities;
};

export function hasEntitlementCapability(
  entitlement: Pick<VerifiedEntitlement, "features">,
  capability: string,
): boolean {
  return CAPABILITY_KEY.test(capability) && entitlement.features[capability] === true;
}

export type StoredLicense = {
  teamId: string;
  installationId: string;
  clientToken: string;
  signedEntitlement: string;
  licenseId: string;
  bindingGeneration: number;
  codeLastFour: string | null;
  lastCheckedAt: string;
};

type LicenseStateFile = {
  version: 1;
  installationId: string;
  licenses: Record<string, StoredLicense>;
};

export class LicenseClientError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 503,
  ) {
    super(code);
    this.name = "LicenseClientError";
  }
}

function statePath(): string {
  const configured = process.env.ERDBPRO_LICENSE_STATE_FILE?.trim();
  return path.resolve(configured || path.join(process.cwd(), ".erdbpro", "license-state.json"));
}

function writeState(state: LicenseStateFile): void {
  const destination = statePath();
  mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(temporary, 0o600);
  renameSync(temporary, destination);
  chmodSync(destination, 0o600);
}

function readState(): LicenseStateFile {
  const destination = statePath();
  try {
    const parsed = JSON.parse(readFileSync(destination, "utf8")) as Partial<LicenseStateFile>;
    if (parsed.version !== 1 || typeof parsed.installationId !== "string" || !UUID_V4.test(parsed.installationId) || !parsed.licenses) {
      throw new LicenseClientError("LICENSE_STATE_INVALID", 500);
    }
    const identity = ensureInstallationIdentity(parsed.installationId);
    if (identity.installationId !== parsed.installationId) {
      throw new LicenseClientError("LICENSE_STATE_INVALID", 500);
    }
    return parsed as LicenseStateFile;
  } catch (error) {
    if (error instanceof LicenseClientError) throw error;
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new LicenseClientError("LICENSE_STATE_INVALID", 500);
    }
    let installationId: string;
    try {
      installationId = ensureInstallationIdentity().installationId;
    } catch {
      throw new LicenseClientError("LICENSE_STATE_INVALID", 500);
    }
    const state: LicenseStateFile = { version: 1, installationId, licenses: {} };
    writeState(state);
    return state;
  }
}

export function getInstallationId(): string {
  return readState().installationId;
}

export function getStoredLicense(teamId: string): StoredLicense | null {
  return readState().licenses[teamId] || null;
}

export function storeLicense(license: StoredLicense): void {
  const state = readState();
  state.licenses[license.teamId] = license;
  writeState(state);
}

export function removeStoredLicense(teamId: string): void {
  const state = readState();
  delete state.licenses[teamId];
  writeState(state);
}

function configuredApiUrl(): URL {
  const raw = process.env.ERDBPRO_LICENSE_API_URL?.trim();
  if (!raw) throw new LicenseClientError("LICENSE_CLIENT_NOT_CONFIGURED", 503);

  try {
    const url = new URL(raw);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new LicenseClientError("LICENSE_API_MUST_USE_HTTPS", 503);
    }
    return url;
  } catch (error) {
    if (error instanceof LicenseClientError) throw error;
    throw new LicenseClientError("LICENSE_API_URL_INVALID", 503);
  }
}

function endpointUrl(action: "activate" | "check"): URL {
  const base = configuredApiUrl();
  return new URL(`/api/v1/license-client/${PRODUCT_TYPE}/${action}`, base.origin);
}

async function requestLicenseApi(
  action: "activate" | "check",
  body: Record<string, unknown>,
  clientToken?: string,
): Promise<Record<string, any>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-License-Protocol-Version": String(PROTOCOL_VERSION),
    "X-Request-Id": randomUUID(),
  };
  if (clientToken) headers.Authorization = `Bearer ${clientToken}`;
  if (action === "activate") headers["Idempotency-Key"] = randomUUID();

  let response: Response;
  try {
    response = await fetch(endpointUrl(action), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new LicenseClientError("LICENSE_SERVICE_UNAVAILABLE", 503);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = typeof payload?.error?.code === "string"
      ? payload.error.code
      : typeof payload?.code === "string" ? payload.code : "LICENSE_REQUEST_REJECTED";
    throw new LicenseClientError(code, response.status);
  }
  if (!payload || typeof payload !== "object") {
    throw new LicenseClientError("LICENSE_RESPONSE_INVALID", 502);
  }
  return payload as Record<string, any>;
}

function basePayload(data: {
  installationId: string;
  teamId: string;
  teamName: string;
  memberCount: number;
}) {
  return {
    protocol_version: PROTOCOL_VERSION,
    product_type: PRODUCT_TYPE,
    client_type: CLIENT_TYPE,
    installation_id: data.installationId,
    app_version: (process.env.APP_VERSION || "unknown").slice(0, 100),
    platform: process.platform.slice(0, 100),
    device_name: (process.env.ERDBPRO_DEPLOYMENT_NAME || "Self-host deployment").slice(0, 100),
    deployment: {
      name: data.teamName,
      local_team_id: data.teamId,
    },
    usage: { member_count: data.memberCount },
  };
}

export function buildSelfHostActivationPayload(data: {
  installationId: string;
  teamId: string;
  teamName: string;
  licenseKey: string;
  activationGrant?: string;
  memberCount: number;
}) {
  return {
    ...basePayload(data),
    license_key: data.licenseKey,
    ...(data.activationGrant ? { activation_grant: data.activationGrant } : {}),
  };
}

function decodeBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new LicenseClientError("LICENSE_SIGNATURE_INVALID", 502);
  }
}

function claimAudience(value: unknown): boolean {
  return typeof value === "string" ? value === AUDIENCE : Array.isArray(value) && value.includes(AUDIENCE);
}

export function verifySignedEntitlement(
  signedEntitlement: string,
  expectedInstallationId: string,
  previousGeneration?: number,
): VerifiedEntitlement {
  const parts = signedEntitlement.split(".");
  if (parts.length !== 3) throw new LicenseClientError("LICENSE_SIGNATURE_INVALID", 502);

  let header: any;
  let claims: any;
  try {
    header = JSON.parse(decodeBase64Url(parts[0]).toString("utf8"));
    claims = JSON.parse(decodeBase64Url(parts[1]).toString("utf8"));
  } catch {
    throw new LicenseClientError("LICENSE_SIGNATURE_INVALID", 502);
  }

  // Test fixtures may inject an ephemeral key. Runtime builds always use the
  // bundled official key, so a production .env cannot trust a fake issuer.
  const publicKey = process.env.NODE_ENV === "test"
    ? process.env.ERDBPRO_LICENSE_PUBLIC_KEY?.trim().replace(/\\n/g, "\n") || OFFICIAL_LICENSE_PUBLIC_KEY
    : OFFICIAL_LICENSE_PUBLIC_KEY;
  const issuer = process.env.ERDBPRO_LICENSE_ISSUER?.trim();
  const keyId = process.env.NODE_ENV === "test"
    ? process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID?.trim() || OFFICIAL_LICENSE_PUBLIC_KEY_ID
    : OFFICIAL_LICENSE_PUBLIC_KEY_ID;
  if (!publicKey || !issuer) throw new LicenseClientError("LICENSE_VERIFICATION_NOT_CONFIGURED", 503);
  if (header?.alg !== "EdDSA" || header?.kid !== keyId) {
    throw new LicenseClientError("LICENSE_SIGNATURE_INVALID", 502);
  }

  try {
    const valid = verifySignature(
      null,
      Buffer.from(`${parts[0]}.${parts[1]}`),
      createPublicKey(publicKey),
      decodeBase64Url(parts[2]),
    );
    if (!valid) throw new Error("invalid signature");
  } catch {
    throw new LicenseClientError("LICENSE_SIGNATURE_INVALID", 502);
  }

  const now = Math.floor(Date.now() / 1000);
  const limits = claims?.limits;
  const maxMembers = limits?.max_members;
  if (
    claims?.iss !== issuer ||
    !claimAudience(claims?.aud) ||
    claims?.product_type !== PRODUCT_TYPE ||
    claims?.client_type !== CLIENT_TYPE ||
    claims?.installation_id !== expectedInstallationId ||
    typeof claims?.sub !== "string" ||
    !UUID_CANONICAL.test(claims.sub) ||
    typeof claims?.jti !== "string" ||
    claims.jti.length < 1 ||
    claims.jti.length > 128 ||
    !Number.isInteger(claims?.iat) ||
    claims.iat > now + 300 ||
    !Number.isInteger(claims?.exp)
  ) {
    throw new LicenseClientError("LICENSE_ENTITLEMENT_INVALID", 502);
  }
  if (claims.exp <= now) throw new LicenseClientError("LICENSE_EXPIRED", 403);
  if (!Number.isInteger(claims?.binding_generation) || claims.binding_generation < 1) {
    throw new LicenseClientError("LICENSE_ENTITLEMENT_INVALID", 502);
  }
  if (previousGeneration !== undefined && claims.binding_generation < previousGeneration) {
    throw new LicenseClientError("BINDING_GENERATION_MISMATCH", 409);
  }
  if (claims?.organization_type !== "team" || !Number.isInteger(maxMembers) || maxMembers < 1) {
    throw new LicenseClientError("LICENSE_ENTITLEMENT_INVALID", 502);
  }

  return {
    licenseId: claims.sub,
    installationId: claims.installation_id,
    bindingGeneration: claims.binding_generation,
    planCode: typeof claims.plan_code === "string" ? claims.plan_code : "unknown",
    organizationType: claims.organization_type,
    maxMembers: maxMembers ?? null,
    issuedAt: claims.iat,
    expiresAt: claims.exp,
    features: normalizeLicenseCapabilities(claims.features),
  };
}

export async function activateSelfHostLicense(data: {
  teamId: string;
  teamName: string;
  licenseKey: string;
  activationGrant?: string;
  memberCount: number;
}) {
  if (!isLocalPostgres()) throw new LicenseClientError("SELF_HOST_ONLY", 403);
  const installationId = getInstallationId();
  const response = await requestLicenseApi(
    "activate",
    buildSelfHostActivationPayload({ ...data, installationId }),
  );
  const clientToken = typeof response.client_token === "string" ? response.client_token : "";
  const signedEntitlement = typeof response.signed_entitlement === "string" ? response.signed_entitlement : "";
  if (!clientToken || !signedEntitlement) throw new LicenseClientError("LICENSE_RESPONSE_INVALID", 502);

  const entitlement = verifySignedEntitlement(signedEntitlement, installationId);
  return {
    clientToken,
    signedEntitlement,
    entitlement,
    codeLastFour: typeof response.license?.code_last_four === "string" ? response.license.code_last_four.slice(-4) : null,
    state: {
      teamId: data.teamId,
      installationId,
      clientToken,
      signedEntitlement,
      licenseId: entitlement.licenseId,
      bindingGeneration: entitlement.bindingGeneration,
      codeLastFour: typeof response.license?.code_last_four === "string" ? response.license.code_last_four.slice(-4) : null,
      lastCheckedAt: new Date().toISOString(),
    } satisfies StoredLicense,
  };
}

export async function checkSelfHostLicense(data: {
  teamId: string;
  teamName: string;
  memberCount: number;
}) {
  if (!isLocalPostgres()) throw new LicenseClientError("SELF_HOST_ONLY", 403);
  const stored = getStoredLicense(data.teamId);
  if (!stored) throw new LicenseClientError("LICENSE_NOT_ACTIVATED", 409);
  const installationId = getInstallationId();
  const response = await requestLicenseApi(
    "check",
    basePayload({ ...data, installationId }),
    stored.clientToken,
  );
  const signedEntitlement = typeof response.signed_entitlement === "string" ? response.signed_entitlement : "";
  if (!signedEntitlement) throw new LicenseClientError("LICENSE_RESPONSE_INVALID", 502);
  const entitlement = verifySignedEntitlement(signedEntitlement, installationId, stored.bindingGeneration);
  const nextState: StoredLicense = {
    ...stored,
    installationId,
    signedEntitlement,
    licenseId: entitlement.licenseId,
    bindingGeneration: entitlement.bindingGeneration,
    lastCheckedAt: new Date().toISOString(),
  };
  storeLicense(nextState);
  return { entitlement, state: nextState };
}

export function verifyStoredLicense(teamId: string): { state: StoredLicense; entitlement: VerifiedEntitlement } {
  const state = getStoredLicense(teamId);
  if (!state) throw new LicenseClientError("LICENSE_NOT_ACTIVATED", 409);
  const installationId = getInstallationId();
  if (state.installationId !== installationId) {
    throw new LicenseClientError("LICENSE_STATE_INVALID", 500);
  }
  return {
    state,
    entitlement: verifySignedEntitlement(state.signedEntitlement, installationId, state.bindingGeneration),
  };
}
