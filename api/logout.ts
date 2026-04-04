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

  const isProd = process.env.NODE_ENV === "production" || req.headers.get("x-v-proto") === "https" || req.url.startsWith("https://");

  const cookieOptions = [
    "token=",
    "HttpOnly",
    isProd ? "Secure" : "",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].filter(Boolean);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookieOptions.join("; "),
    },
  });
}
