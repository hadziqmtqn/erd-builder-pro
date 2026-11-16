import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import {
  resolveSsoAccountAction,
  SsoIdentityError,
  ssoFailureRedirect,
  finishSso,
  ssoStorageEmail,
  startSso,
} from "./sso.js";
import { logger } from "../../lib/logger.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/erd");
    vi.stubEnv("ERD_INSTALL_MODE", "web");
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

  it("reports a cancelled consent instead of an invalid response", async () => {
    vi.stubEnv("AUTH_MODE", "sso");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/erd");
    vi.stubEnv("ERD_INSTALL_MODE", "web");
    vi.stubEnv("APP_URL", "https://cloud.example.com");
    vi.stubEnv("SSO_ISSUER_URL", "https://account.example.com");
    vi.stubEnv("SSO_CLIENT_ID", "cloud-client");
    vi.stubEnv("SSO_REDIRECT_URI", "https://cloud.example.com/api/sso/callback");

    const redirectFor = async (query: Record<string, string>) => {
      let redirect = "";
      await finishSso({
        query,
        cookies: { erdbpro_sso_state: "state-1", erdbpro_sso_verifier: "verifier-1" },
        header: () => undefined,
      } as unknown as Request, {
        clearCookie: () => undefined,
        redirect: (value: string) => { redirect = value; },
      } as unknown as Response);
      return new URL(redirect).searchParams.get("error");
    };

    expect(await redirectFor({ error: "access_denied", state: "state-1" })).toBe("Sign-in was cancelled");
    expect(await redirectFor({ error: "access_denied", state: "forged" })).toBe("Invalid or expired SSO response");
  });

  it("reports the HTTP status when a proxy redirects the issuer requests", async () => {
    vi.stubEnv("AUTH_MODE", "sso");
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/erd");
    vi.stubEnv("ERD_INSTALL_MODE", "web");
    vi.stubEnv("APP_URL", "https://cloud.example.com");
    vi.stubEnv("SSO_ISSUER_URL", "https://account.example.com");
    vi.stubEnv("SSO_CLIENT_ID", "cloud-client");
    vi.stubEnv("SSO_REDIRECT_URI", "https://cloud.example.com/api/sso/callback");
    // Cloudflare Access answers a request without its session with a redirect to its login page.
    const accessRedirect = () => new Response(null, { status: 302, headers: { Location: "https://access.example.com/login" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(accessRedirect())
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "access-1" }), { status: 200 }))
      .mockResolvedValueOnce(accessRedirect());
    vi.stubGlobal("fetch", fetchMock);
    const logError = vi.spyOn(logger, "error").mockImplementation(() => undefined);
    const callback = async () => {
      let redirect = "";
      await finishSso({
        query: { code: "code-1", state: "state-1" },
        cookies: { erdbpro_sso_state: "state-1", erdbpro_sso_verifier: "verifier-1" },
        header: () => undefined,
      } as unknown as Request, {
        clearCookie: () => undefined,
        redirect: (value: string) => { redirect = value; },
      } as unknown as Response);
      return new URL(redirect).searchParams.get("error");
    };

    expect(await callback()).toBe("Unable to complete SSO login");
    expect(await callback()).toBe("Unable to complete SSO login");

    expect(fetchMock.mock.calls.map(([, init]) => init.redirect)).toEqual(["manual", "manual", "manual"]);
    expect(logError.mock.calls.map(([fields]) => fields)).toEqual([
      { phase: "exchange_token", err: "token exchange failed with HTTP 302" },
      { phase: "fetch_identity", err: "Identity request failed with HTTP 302" },
    ]);
  });

  it("sends unverified accounts to the trusted issuer verification page", () => {
    expect(ssoFailureRedirect(
      new SsoIdentityError("EMAIL_UNVERIFIED", "The email address is not verified."),
      "https://cloud.example.com",
      "https://account.example.com",
    )).toBe("https://account.example.com/email/verify?source=cloud_sso");

    expect(ssoFailureRedirect(new Error("token exchange failed"), "https://cloud.example.com", "https://account.example.com"))
      .toBe("https://cloud.example.com/?error=Unable%20to%20complete%20SSO%20login");
  });
});
