import type { Request } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const AUTH_MESSAGE = { error: "Too many authentication attempts, please try again later" };
const ONE_MINUTE = 60 * 1000;
const FIVE_MINUTES = 5 * ONE_MINUTE;

export function loginCredentialKey(req: Request): string {
  const email = typeof req.body?.email === "string"
    ? req.body.email.trim().toLowerCase()
    : "unknown";

  return `${email}|${ipKeyGenerator(req.ip ?? "unknown")}`;
}

function limiter(windowMs: number, max: number, options: Parameters<typeof rateLimit>[0] = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: AUTH_MESSAGE,
    ...options,
  });
}

export function createAuthRateLimiters() {
  return {
    localIp: limiter(ONE_MINUTE, 10, { skipSuccessfulRequests: true }),
    localIpBackoff: limiter(FIVE_MINUTES, 30, { skipSuccessfulRequests: true }),
    localCredential: limiter(ONE_MINUTE, 5, {
      keyGenerator: loginCredentialKey,
      skipSuccessfulRequests: true,
    }),
    localCredentialBackoff: limiter(FIVE_MINUTES, 15, {
      keyGenerator: loginCredentialKey,
      skipSuccessfulRequests: true,
    }),
    ssoIp: limiter(ONE_MINUTE, 10),
    ssoIpBackoff: limiter(FIVE_MINUTES, 30),
  };
}
