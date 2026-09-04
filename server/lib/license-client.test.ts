import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";

import { LicenseClientError, verifySignedEntitlement } from "./license-client";

const originalIssuer = process.env.ERDBPRO_LICENSE_ISSUER;
const originalPublicKey = process.env.ERDBPRO_LICENSE_PUBLIC_KEY;
const originalKeyId = process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalIssuer === undefined) delete process.env.ERDBPRO_LICENSE_ISSUER;
  else process.env.ERDBPRO_LICENSE_ISSUER = originalIssuer;
  if (originalPublicKey === undefined) delete process.env.ERDBPRO_LICENSE_PUBLIC_KEY;
  else process.env.ERDBPRO_LICENSE_PUBLIC_KEY = originalPublicKey;
  if (originalKeyId === undefined) delete process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID;
  else process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = originalKeyId;
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signedEntitlement(installationId: string): string {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.ERDBPRO_LICENSE_ISSUER = "https://license.example.test";
  process.env.ERDBPRO_LICENSE_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
  process.env.ERDBPRO_LICENSE_PUBLIC_KEY_ID = "key-1";

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "EdDSA", typ: "JWT", kid: "key-1" };
  const claims = {
    iss: "https://license.example.test",
    aud: "erd-self-host",
    product_type: "self_host",
    client_type: "web",
    installation_id: installationId,
    sub: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
    jti: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
    iat: now,
    exp: now + 3600,
    binding_generation: 2,
    organization_type: "team",
    plan_code: "team-10",
    limits: { max_members: 10 },
    features: ["team_files"],
  };
  const signingInput = `${encode(header)}.${encode(claims)}`;
  const signature = sign(null, Buffer.from(signingInput), privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

describe("self-host license entitlement verification", () => {
  it("accepts a valid signed team entitlement", () => {
    const installationId = "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa";
    const entitlement = verifySignedEntitlement(signedEntitlement(installationId), installationId);

    expect(entitlement).toMatchObject({
      licenseId: "018f3f7e-1c33-43f2-a4e4-19b55e61d3fa",
      bindingGeneration: 2,
      planCode: "team-10",
      maxMembers: 10,
      organizationType: "team",
    });
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
