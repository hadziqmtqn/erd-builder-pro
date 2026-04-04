import { parseCookies } from "./lib/edge-auth.js";
import { getEdgeSupabase } from "./lib/edge-config.js";

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

  const { data: { user }, error } = await getEdgeSupabase().auth.getUser(token);
  
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid token or session" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ authenticated: true, user }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
