import { describe, expect, it } from "vitest";
import { createAuthRateLimiters, loginCredentialKey } from "./auth-rate-limit.js";

describe("authentication rate limits", () => {
  it("keys credentials by normalized email and client IP", () => {
    expect(loginCredentialKey({
      body: { email: "  User@Example.COM " },
      ip: "127.0.0.1",
    } as any)).toBe("user@example.com|127.0.0.1");
  });

  it("returns 429 and Retry-After after repeated failed attempts", async () => {
    const limits = createAuthRateLimiters();
    const request = { body: { email: "user@example.com", password: "wrong" }, ip: "127.0.0.1" } as any;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = fakeResponse(401);
      await limits.localCredential(request, response, () => {});
    }

    const response = fakeResponse(401);
    await limits.localCredential(request, response, () => {});

    expect(response.statusCode).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("limits an IP across different email addresses", async () => {
    const limits = createAuthRateLimiters();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = fakeResponse(401);
      await limits.localIp(
        { body: { email: `user-${attempt}@example.com` }, ip: "127.0.0.1" } as any,
        response,
        () => {},
      );
    }

    const response = fakeResponse(401);
    await limits.localIp(
      { body: { email: "different@example.com" }, ip: "127.0.0.1" } as any,
      response,
      () => {},
    );

    expect(response.statusCode).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("does not count successful login responses against the credential limit", async () => {
    const limits = createAuthRateLimiters();
    const request = { body: { email: "successful@example.com", password: "correct" }, ip: "127.0.0.1" } as any;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = fakeResponse(200);
      await limits.localCredential(request, response, () => response.finish());
    }

    const response = fakeResponse(401);
    await limits.localCredential(request, response, () => {});

    expect(response.statusCode).toBe(401);
  });
});

function fakeResponse(statusCode: number) {
  const headers = new Map<string, string>();
  const finishHandlers: Array<() => void> = [];

  return {
    statusCode,
    headers,
    headersSent: false,
    writableEnded: false,
    setHeader(name: string, value: string | number) {
      headers.set(name, String(value));
    },
    once(event: string, handler: () => void) {
      if (event === "finish") finishHandlers.push(handler);
    },
    finish() {
      for (const handler of finishHandlers) handler();
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send() {
      this.writableEnded = true;
      return this;
    },
  } as any;
}
