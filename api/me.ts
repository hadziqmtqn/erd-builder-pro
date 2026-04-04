import { parseCookies, verifyEdgeToken } from "./lib/edge-auth.js";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const cookies = parseCookies(req);
  const token = cookies.token;

  if (!token) {
    return new Response(JSON.stringify({ error: "Not logged in" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const payload = await verifyEdgeToken(token);
  if (!payload) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ authenticated: true, user: payload }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
