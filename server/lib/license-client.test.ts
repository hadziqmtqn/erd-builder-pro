import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  activateSelfHostInstanceLicense,
  activateSelfHostLicense,
  getInstallationId,
  getStoredLicense,
  hasEntitlementCapability,
  LicenseClientError,
  storeInstanceLicense,
  verifySignedEntitlement,
} from "./license-client";

const originalIssuer = process.env.ERDBPRO_LICENSE_ISSUER;
const originalPublicKey = process.env.ERDBPRO_LICENSE_PUBLIC_KEY;
const originalKeyId = process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID;
const originalNodeEnv = process.env.NODE_ENV;
const originalApiUrl = process.env.ERDBPRO_LICENSE_API_URL;
const originalStateFile = process.env.ERDBPRO_LICENSE_STATE_FILE;
let temporaryDirectory: string | null = null;

afterEach(() => {
  if (originalIssuer === undefined) delete process.env.ERDBPRO_LICENSE_ISSUER;
  else process.env.ERDBPRO_LICENSE_ISSUER = originalIssuer;
  if (originalPublicKey === undefined) delete process.env.ERDBPRO_LICENSE_PUBLIC_KEY;
  else process.env.ERDBPRO_LICENSE_PUBLIC_KEY = originalPublicKey;
  if (originalKeyId === undefined) delete process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID;
  else process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = originalKeyId;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalApiUrl === undefined) delete process.env.ERDBPRO_LICENSE_API_URL;
  else process.env.ERDBPRO_LICENSE_API_URL = originalApiUrl;
  if (originalStateFile === undefined) delete process.env.ERDBPRO_LICENSE_STATE_FILE;
  else process.env.ERDBPRO_LICENSE_STATE_FILE = originalStateFile;
  vi.unstubAllGlobals();
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = null;
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedEntitlement(
  installationId: string,
  features: unknown = ["team_files"],
  audience = "erd-self-host",
): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.ERDBPRO_LICENSE_ISSUER = "https://license.example.test";
  process.env.ERDBPRO_LICENSE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = "key-1";

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT", kid: "key-1" };
  const claims = {
    iss: "https://license.example.test",
    aud: audience,
    product_type: "self_host",
    client_type: "web",
    installation_id: installationId,
    sub: "01a070a2-beb5-705e-9227-9f4c66e98241",
    jti: "01a070a2-beb5-705e-9227-9f4c66e98241",
    iat: now,
    exp: now + 3600,
    binding_generation: 2,
    organization_type: "team",
    plan_code: "team-10",
    limits: { max_members: 10, max_teams: 2 },
    features,
  };
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

describe("self-host license entitlement verification", () => {
  it("preserves the canonical SaaS error code", async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erdbpro-license-test-"));
    process.env.ERDBPRO_LICENSE_API_URL = "https://license.example.test";
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(temporaryDirectory, "license-state.json");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: "SERVICE_UNAVAILABLE", message: "The license service is temporarily unavailable." },
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    await expect(activateSelfHostLicense({
      teamId: "team-1",
      teamName: "Team One",
      licenseKey: "license-key",
      memberCount: 0,
    })).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE", status: 503 });
  });

  it("accepts a valid signed team entitlement", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";
    const entitlement = verifySignedEntitlement(signedEntitlement(installationId), installationId);

    expect(entitlement).toMatchObject({
      licenseId: "01a070a2-beb5-705e-9227-9f4c66e98241",
      bindingGeneration: 2,
      planCode: "team-10",
      maxMembers: 10,
      maxTeams: 2,
      organizationType: "team",
      features: { team_files: true },
    });
    expect(hasEntitlementCapability(entitlement, "team_files")).toBe(true);
  });

  it("accepts the instance-license audience issued by the current SaaS", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";

    expect(() => verifySignedEntitlement(
      signedEntitlement(installationId, ["team_files"], "erd-self-host-instance-license"),
      installationId,
    )).not.toThrow();
  });

  it("activates one instance license and reports global usage", async () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erdbpro-license-test-"));
    process.env.ERDBPRO_LICENSE_API_URL = "https://license.example.test";
    process.env.ERDBPRO_LICENSE_STATE_FILE = path.join(temporaryDirectory, "license-state.json");
    const installationId = getInstallationId();
    const token = signedEntitlement(installationId, ["team_files"], "erd-self-host-instance-license");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      client_token: "instance-client-token",
      signed_entitlement: token,
      license: { code_last_four: "ABCD" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const { entitlement } = await activateSelfHostInstanceLicense({
      licenseKey: "license-key",
      teamCount: 2,
      memberCount: 8,
    });

    expect(entitlement.maxTeams).toBe(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      usage: { team_count: 2, member_count: 8 },
    });
  });

  it("keeps legacy Team leases when state is upgraded for an instance lease", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "erdbpro-license-test-"));
    const stateFile = path.join(temporaryDirectory, "license-state.json");
    process.env.ERDBPRO_LICENSE_STATE_FILE = stateFile;
    const installationId = getInstallationId();
    const legacyLicense = {
      teamId: "team-1",
      installationId,
      clientToken: "legacy-token",
      signedEntitlement: "legacy-entitlement",
      licenseId: "01a070a2-beb5-705e-9227-9f4c66e98241",
      bindingGeneration: 1,
      codeLastFour: "ABCD",
      lastCheckedAt: new Date().toISOString(),
    };
    writeFileSync(stateFile, JSON.stringify({ version: 1, installationId, licenses: { "team-1": legacyLicense } }));

    storeInstanceLicense({
      ...legacyLicense,
      clientToken: "instance-token",
    });

    expect(getStoredLicense("team-1")).toMatchObject(legacyLicense);
    expect(JSON.parse(readFileSync(stateFile, "utf8"))).toMatchObject({
      version: 2,
      licenses: { "team-1": legacyLicense },
      instanceLicense: { clientToken: "instance-token" },
    });
  });

  it("enables only explicitly signed capabilities", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";
    const entitlement = verifySignedEntitlement(signedEntitlement(installationId, {
      member_billing: true,
      team_files: false,
      "invalid-key": true,
      string_value: "true",
    }), installationId);

    expect(hasEntitlementCapability(entitlement, "member_billing")).toBe(true);
    expect(hasEntitlementCapability(entitlement, "team_files")).toBe(false);
    expect(hasEntitlementCapability(entitlement, "invalid-key")).toBe(false);
    expect(hasEntitlementCapability(entitlement, "string_value")).toBe(false);
  });

  it("rejects a payload changed after signing", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";
    const token = signedEntitlement(installationId);
    const [header, , signature] = token.split(".");
    const tamperedClaims = encode({
      iss: "https://license.example.test",
      aud: "erd-self-host",
      product_type: "self_host",
      client_type: "web",
      installation_id: installationId,
      sub: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
      jti: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
      binding_generation: 2,
      organization_type: "team",
      limits: { max_members: 1000 },
    });

    expect(() => verifySignedEntitlement(`${header}.${tamperedClaims}.${signature}`, installationId))
      .toThrowError(LicenseClientError);
    try {
      verifySignedEntitlement(`${header}.${tamperedClaims}.${signature}`, installationId);
    } catch (error) {
      expect(error).toMatchObject({ code: "LICENSE_SIGNATURE_INVALID" });
    }
  });

  it("ignores a configured public key outside test mode", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";
    const token = signedEntitlement(installationId);
    process.env.NODE_ENV = "production";

    expect(() => verifySignedEntitlement(token, installationId))
      .toThrowError(LicenseClientError);
    try {
      verifySignedEntitlement(token, installationId);
    } catch (error) {
      expect(error).toMatchObject({ code: "LICENSE_SIGNATURE_INVALID" });
    }
  });
});
