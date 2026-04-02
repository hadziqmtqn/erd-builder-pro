import { signEdgeToken } from "./lib/edge-auth";
import { ADMIN_EMAIL, ADMIN_PASSWORD } from "./lib/edge-config";

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

    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      const token = await signEdgeToken({ email });
      const isProd = process.env.NODE_ENV === "production" || req.headers.get("x-v-proto") === "https" || req.url.startsWith("https://");
      
      const cookieOptions = [
        `token=${token}`,
        "HttpOnly",
        isProd ? "Secure" : "",
        "Path=/",
        "SameSite=Lax",
        `Max-Age=${24 * 60 * 60}`, // 24 hours
      ].filter(Boolean);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": cookieOptions.join("; "),
        },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid credentials" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Invalid request" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
}
