import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { resolveSsoAccountAction, ssoStorageEmail, startSso } from "./sso.js";

afterEach(() => vi.unstubAllEnvs());

describe("Cloud SSO", () => {
  it("keeps SSO identity separate from an existing local email", () => {
    expect(ssoStorageEmail("019abcde-1234")).toBe("019abcde-1234@sso.erdbpro.invalid");
  });

  it("requires proof before linking an existing local account", () => {
    const remote = { id: "sso-user", email: "owner@example.com" };
    const legacy = { id: "local-user", email: remote.email };
    expect(resolveSsoAccountAction(null, legacy, remote)).toBe("link");
    expect(resolveSsoAccountAction(
      { id: "other", email: "other@example.com", ssoSubject: remote.id, ssoEmail: remote.email },
      legacy,
      remote,
    )).toBe("conflict");
    expect(resolveSsoAccountAction(
      { id: "generated", email: ssoStorageEmail(remote.id), ssoSubject: remote.id, ssoEmail: remote.email },
      legacy,
      remote,
    )).toBe("link");
  });

  it("starts Passport authorization code flow with PKCE S256", () => {
    vi.stubEnv("AUTH_MODE", "sso");
    vi.stubEnv("APP_URL", "https://cloud.example.com");
    vi.stubEnv("SSO_ISSUER_URL", "https://account.example.com");
    vi.stubEnv("SSO_CLIENT_ID", "cloud-client");
    vi.stubEnv("SSO_REDIRECT_URI", "https://cloud.example.com/api/sso/callback");

    const cookies = new Map<string, string>();
    let redirect = "";
    const response = {
      cookie: (name: string, value: string) => { cookies.set(name, value); },
      clearCookie: (name: string) => { cookies.delete(name); },
      redirect: (value: string) => { redirect = value; },
    } as unknown as Response;

    startSso({} as Request, response);

    const url = new URL(redirect);
    expect(url.origin).toBe("https://account.example.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cloud-client");
    expect(url.searchParams.get("scope")).toBe("cloud:access");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(cookies.get("erdbpro_sso_state"));
    expect(url.searchParams.get("code_challenge")).not.toBe(cookies.get("erdbpro_sso_verifier"));
  });
});
