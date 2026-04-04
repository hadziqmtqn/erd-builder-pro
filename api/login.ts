import { getEdgeSupabase } from "./lib/edge-config.js";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const email = body.email?.trim();
    const password = body.password;
    const supabase = getEdgeSupabase();

    // Standard flow: Password login
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    if (authData && authData.session) {
      const token = authData.session.access_token;
      const isProd = process.env.NODE_ENV === "production" || req.headers.get("x-v-proto") === "https" || req.url.startsWith("https://");
      
      const cookieOptions = [
        `token=${token}`,
        "HttpOnly",
        isProd ? "Secure" : "",
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${authData.session.expires_in}`, // Use Supabase expiration
      ].filter(Boolean);

      return new Response(JSON.stringify({ success: true, user: authData.user }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": cookieOptions.join("; "),
        },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
