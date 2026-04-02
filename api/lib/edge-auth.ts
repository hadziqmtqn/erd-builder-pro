import * as jose from "jose";
import { JWT_SECRET } from "./edge-config";

// Convert secret string to Uint8Array for jose
const secret = new TextEncoder().encode(JWT_SECRET);

/**
 * Verify a JWT token on Vercel Edge Runtime using 'jose'
 */
export async function verifyEdgeToken(token: string) {
  try {
    const { payload } = await jose.jwtVerify(token, secret);
    return payload;
  } catch (error) {
    return null;
  }
}

/**
 * Sign a JWT token on Vercel Edge Runtime using 'jose'
 */
export async function signEdgeToken(payload: any) {
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

/**
 * Simple cookie parser for Edge Request objects
 */
export function parseCookies(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies: { [key: string]: string } = {};
  cookieHeader.split(";").forEach((cookie) => {
    const [name, ...rest] = cookie.split("=");
    if (name && rest.length > 0) {
      cookies[name.trim()] = rest.join("=").trim();
    }
  });
  return cookies;
}
