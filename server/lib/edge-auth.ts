import { getEdgeSupabase } from "./edge-config.js";

export async function verifyEdgeToken(token: string) {
  try {
    const supabase = getEdgeSupabase();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (error) {
    return null;
  }
}

export async function signEdgeToken(payload: any) {
  throw new Error("Custom JWT signing is disabled. Supabase Auth issues session tokens.");
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
