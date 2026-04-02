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

  const cookieOptions = [
    "token=",
    "HttpOnly",
    "Secure",
    "Path=/",
    "SameSite=None",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": cookieOptions.join("; "),
    },
  });
}
